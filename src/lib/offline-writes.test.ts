import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * Offline schedule management.
 *
 * The behaviours under test are the ones a user would describe as "it lost my
 * timetable": validation that happens before the write rather than hours later,
 * a schedule that survives being queued, and a delete that does not resurrect
 * the thing it deleted.
 */
const store = vi.hoisted(() => {
  const data = new Map<string, unknown>();
  const queue = new Map<string, Record<string, unknown>>();
  return {
    data,
    queue,
    reset() {
      data.clear();
      queue.clear();
    },
  };
});

vi.mock("@/lib/offline-cache", () => ({
  cacheRead: vi.fn(async (key: string) => store.data.get(key) ?? null),
  cacheWrite: vi.fn(async (key: string, value: unknown) => {
    store.data.set(key, value);
  }),
  cacheRemove: vi.fn(async (key: string) => {
    store.data.delete(key);
  }),
  isNetworkError: vi.fn(() => false),
}));

vi.mock("@/lib/offline-queue", () => ({
  enqueueOfflineWrite: vi.fn(
    async (kind: string, payload: unknown, label: string, opts?: { idempotencyKey?: string }) => {
      const entry = {
        id: `q${store.queue.size + 1}`,
        kind,
        label,
        payload,
        createdAt: Date.now() + store.queue.size,
        idempotencyKey: opts?.idempotencyKey,
      };
      store.queue.set(entry.id, entry);
      return entry;
    }
  ),
  listPendingWrites: vi.fn(async () => Array.from(store.queue.values())),
  dropPendingWrite: vi.fn(async (id: string) => {
    store.queue.delete(id);
  }),
}));

import {
  isPendingSync,
  newIdempotencyKey,
  OfflineValidationError,
  saveScheduleForOffline,
  validateOfflineSchedule,
  deleteScheduleForOffline,
  updateScheduleForOffline,
  type LocalSchedule,
} from "@/lib/offline-writes";

// Declared with the optional fields the validator reads, so the fixtures below
// can be spread and overridden without fighting the type.
type ClassLike = {
  subject?: string;
  shortName?: string | null;
  code?: string | null;
  instructor?: string | null;
  room?: string | null;
  section?: string | null;
  block?: string | null;
  notes?: string | null;
  startTime?: string;
  endTime?: string;
  days?: string[];
};

const goodClass: ClassLike = {
  subject: "Calculus",
  shortName: null,
  code: null,
  instructor: "Dela Cruz",
  room: "RM 204",
  section: null,
  block: null,
  notes: null,
  startTime: "08:00",
  endTime: "09:30",
  days: ["monday", "wednesday"],
};

describe("offline schedule validation", () => {
  it("accepts a well-formed schedule", () => {
    expect(
      validateOfflineSchedule({
        title: "BSIT 1st Year",
        classes: [{ ...goodClass, days: ["monday"] }],
      })
    ).toEqual({ ok: true });
  });

  it("rejects an empty title", () => {
    expect(validateOfflineSchedule({ title: "  ", classes: [goodClass] }).ok).toBe(false);
  });

  it("rejects a schedule with no classes", () => {
    expect(validateOfflineSchedule({ title: "Empty", classes: [] }).ok).toBe(false);
  });

  it("rejects a class with no days, which would never appear", () => {
    const result = validateOfflineSchedule({
      title: "T",
      classes: [{ ...goodClass, days: [] }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Calculus");
  });

  it("rejects malformed times rather than storing an unrenderable class", () => {
    expect(
      validateOfflineSchedule({ title: "T", classes: [{ ...goodClass, startTime: "8am" }] }).ok
    ).toBe(false);
    expect(
      validateOfflineSchedule({ title: "T", classes: [{ ...goodClass, endTime: "25:00" }] }).ok
    ).toBe(false);
  });

  it("catches a class that ends before it starts", () => {
    const result = validateOfflineSchedule({
      title: "T",
      classes: [{ ...goodClass, startTime: "10:00", endTime: "09:00" }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ends before it starts");
  });

  it("refuses to save something invalid, rather than queueing it for later rejection", async () => {
    await expect(
      saveScheduleForOffline({
        title: "",
        semester: null,
        academicYear: null,
        classes: [goodClass] as never,
      })
    ).rejects.toBeInstanceOf(OfflineValidationError);
    // Nothing stored, nothing queued: the server must not find out hours later.
    expect(store.data.size).toBe(0);
    expect(store.queue.size).toBe(0);
  });
});

describe("saving a schedule offline", () => {
  beforeEach(() => {
    store.reset();
  });

  it("makes the schedule visible immediately, before any sync", async () => {
    await saveScheduleForOffline({
      title: "BSIT 1st Year",
      semester: "1st",
      academicYear: "2026",
      classes: [goodClass] as never,
    });

    const list = store.data.get("schedule:list") as LocalSchedule[];
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe("BSIT 1st Year");
    expect(list[0]!.classes).toHaveLength(1);
    expect(list[0]!.classes[0]!.subject).toBe("Calculus");
  });

  it("marks it as waiting to sync, never as synced", async () => {
    await saveScheduleForOffline({
      title: "BSIT",
      semester: null,
      academicYear: null,
      classes: [goodClass] as never,
    });
    const list = store.data.get("schedule:list") as LocalSchedule[];
    // A local save is not a server save, and the UI must not imply it is.
    expect(list[0]!.syncState).toBe("queued");
    expect(list[0]!.pendingSync).toBe(true);
    expect(isPendingSync(list[0]!.syncState)).toBe(true);
  });

  it("queues exactly one write, carrying a client key", async () => {
    await saveScheduleForOffline({
      title: "BSIT",
      semester: null,
      academicYear: null,
      classes: [goodClass] as never,
    });
    expect(store.queue.size).toBe(1);
    const entry = Array.from(store.queue.values())[0]!;
    expect(entry.kind).toBe("schedule.create");
    // The key is what makes a retry resolve to the same schedule rather than
    // creating a second one.
    expect(entry.idempotencyKey).toBeTruthy();
    expect((entry.payload as { clientKey?: string }).clientKey).toBe(
      entry.idempotencyKey
    );
  });

  it("gives every schedule its own key", () => {
    expect(newIdempotencyKey("sched")).not.toBe(newIdempotencyKey("sched"));
  });

  it("prepends, matching the server's own ordering", async () => {
    const input = {
      semester: null,
      academicYear: null,
      classes: [goodClass] as never,
    };
    await saveScheduleForOffline({ ...input, title: "First" });
    await saveScheduleForOffline({ ...input, title: "Second" });
    const list = store.data.get("schedule:list") as LocalSchedule[];
    expect(list.map((s) => s.title)).toEqual(["Second", "First"]);
  });

  it("assigns a colour per class so the timetable reads offline", async () => {
    await saveScheduleForOffline({
      title: "Many",
      semester: null,
      academicYear: null,
      classes: [goodClass, goodClass, goodClass] as never,
    });
    const list = store.data.get("schedule:list") as LocalSchedule[];
    const colors = list[0]!.classes.map((c) => c.color);
    expect(new Set(colors).size).toBe(3);
  });
});

describe("editing and deleting offline", () => {
  async function seed(state: LocalSchedule["syncState"] = "queued") {
    await saveScheduleForOffline({
      title: "BSIT 1st Year",
      semester: "1st",
      academicYear: null,
      classes: [goodClass] as never,
    });
    const list = store.data.get("schedule:list") as LocalSchedule[];
    const schedule = { ...list[0]!, syncState: state };
    list[0] = schedule;
    store.data.set("schedule:list", list);
    return schedule;
  }

  beforeEach(() => {
    store.reset();
  });

  it("applies an edit locally and queues it", async () => {
    const schedule = await seed();
    store.queue.clear();

    const ok = await updateScheduleForOffline(schedule.id, { title: "BSIT 2nd Year" });
    expect(ok).toBe(true);

    const list = store.data.get("schedule:list") as LocalSchedule[];
    expect(list[0]!.title).toBe("BSIT 2nd Year");
    expect(store.queue.size).toBe(1);
    expect(Array.from(store.queue.values())[0]!.kind).toBe("schedule.update");
  });

  it("keeps an edited record marked as waiting to sync", async () => {
    const schedule = await seed();
    await updateScheduleForOffline(schedule.id, { title: "Renamed" });
    const list = store.data.get("schedule:list") as LocalSchedule[];
    // Editing something already unsynced must not "upgrade" it to synced.
    expect(isPendingSync(list[0]!.syncState)).toBe(true);
  });

  it("reports failure for a schedule this device never loaded", async () => {
    // Returning false rather than throwing lets the caller fall back to the
    // network instead of pretending the edit was saved.
    await expect(updateScheduleForOffline("never-seen", { title: "x" })).resolves.toBe(false);
  });

  it("hides a deleted schedule and queues the delete", async () => {
    // Already on the server, so the server has to be told to remove it.
    const schedule = await seed("synced");
    store.queue.clear();

    const result = await deleteScheduleForOffline(schedule.id);
    expect(result.queued).toBe(true);
    expect(result.discardedWork).toBe(false);
    expect(store.data.get("schedule:list")).toEqual([]);
    expect(Array.from(store.queue.values())[0]!.kind).toBe("schedule.delete");
  });

  it("cancels the queued create instead of deleting something the server never had", async () => {
    const schedule = await seed();
    // Still unsynced, so the server has never seen it.
    expect(isPendingSync(schedule.syncState)).toBe(true);

    const result = await deleteScheduleForOffline(schedule.id);

    expect(result.discardedWork).toBe(true);
    expect(result.queued).toBe(false);
    expect(store.data.get("schedule:list")).toEqual([]);
    // Leaving the create queued would let it land *after* the delete and
    // resurrect a timetable the user just removed.
    expect(store.queue.size).toBe(0);
  });

  it("does nothing for a schedule that is not there", async () => {
    await expect(deleteScheduleForOffline("nope")).resolves.toEqual({
      queued: false,
      discardedWork: false,
    });
  });
});

describe("sync states", () => {
  it("treats only a synced record as settled", () => {
    expect(isPendingSync("local")).toBe(true);
    expect(isPendingSync("queued")).toBe(true);
    expect(isPendingSync("syncing")).toBe(true);
    expect(isPendingSync("failed")).toBe(true);
    expect(isPendingSync("synced")).toBe(false);
  });

  it("treats a missing state as unknown, not as synced", () => {
    // Records written by a build before sync states existed carry nothing, and
    // there is no safe way to read that as "the server has it".
    expect(isPendingSync(undefined)).toBe(false);
    // "Conflict" is its own state and is not a pending write — it needs a human.
    expect(isPendingSync("conflict")).toBe(false);
  });
});
