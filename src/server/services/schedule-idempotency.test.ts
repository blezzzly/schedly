import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * Duplicate prevention for offline creates.
 *
 * The scenario this defends against is narrow and real: a schedule is queued
 * offline, the request reaches the server, the server saves it, and then the
 * response is lost — a tunnel, a dropped connection, a backgrounded tab. The
 * device sees a failure and retries. Without an idempotency key the user ends up
 * with the same timetable twice, and never learns why.
 *
 * The key is generated on the device, stored on the row, and reused on every
 * retry. These tests pin the behaviour at the service layer, where the decision
 * is actually made.
 */

const db = vi.hoisted(() => ({
  scheduleFindFirst: vi.fn(),
  scheduleCreate: vi.fn(),
  classCreateMany: vi.fn(),
  reminderCreateMany: vi.fn(),
  userFindUnique: vi.fn(async () => ({ defaultReminderMinutes: 15 })),
}));

vi.mock("@/server/db/client", () => ({
  db: {
    schedule: { findFirst: db.scheduleFindFirst, findUnique: vi.fn() },
    class: { createMany: db.classCreateMany },
    reminder: { createMany: db.reminderCreateMany },
    user: { findUnique: db.userFindUnique },
    upload: { findFirst: vi.fn(async () => null), update: vi.fn() },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        schedule: { create: db.scheduleCreate },
        // `findMany` is how the service reads back the classes it just inserted,
        // to attach a reminder to each.
        class: {
          createMany: db.classCreateMany,
          findMany: vi.fn(async () => [{ id: "class-1" }]),
        },
        reminder: { createMany: db.reminderCreateMany },
        upload: { findFirst: vi.fn(async () => null), update: vi.fn() },
      }),
  },
}));

import { scheduleService } from "@/server/services/schedule.service";

const input = {
  title: "BSIT 1st Year",
  classes: [
    {
      subject: "Calculus",
      startTime: "08:00",
      endTime: "09:30",
      days: ["monday" as const],
    },
  ],
};

describe("offline create idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.scheduleCreate.mockResolvedValue({ id: "new-schedule-id" });
    db.classCreateMany.mockResolvedValue({ count: 1 });
    db.reminderCreateMany.mockResolvedValue({ count: 1 });
  });

  it("returns the existing schedule when the key has already been used", async () => {
    db.scheduleFindFirst.mockResolvedValue({ id: "already-created" });

    const result = await scheduleService.createIdempotent("user-1", {
      ...input,
      clientKey: "sched-abc",
    });

    // The retry resolves to the original row...
    expect(result.schedule.id).toBe("already-created");
    expect(result.deduped).toBe(true);
    // ...and nothing was inserted a second time.
    expect(db.scheduleCreate).not.toHaveBeenCalled();
  });

  it("creates normally the first time a key is seen", async () => {
    db.scheduleFindFirst.mockResolvedValue(null);

    const result = await scheduleService.createIdempotent("user-1", {
      ...input,
      clientKey: "sched-abc",
    });

    expect(result.schedule.id).toBe("new-schedule-id");
    expect(result.deduped).toBe(false);
    expect(db.scheduleCreate).toHaveBeenCalledTimes(1);
  });

  it("stores the key on the row, so a later retry can recognise it", async () => {
    db.scheduleFindFirst.mockResolvedValue(null);
    await scheduleService.createIdempotent("user-1", { ...input, clientKey: "sched-abc" });

    expect(db.scheduleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientKey: "sched-abc" }),
      })
    );
  });

  it("looks up by user as well as key, so one account cannot read another's row", async () => {
    db.scheduleFindFirst.mockResolvedValue({ id: "already-created" });
    await scheduleService.createIdempotent("user-1", { ...input, clientKey: "sched-abc" });

    // A clientKey is not a secret, so the lookup must be scoped to the session's
    // user rather than trusting the key on its own.
    expect(db.scheduleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientKey: "sched-abc", userId: "user-1" } })
    );
  });

  it("survives two retries racing each other", async () => {
    // Both pass the "have I seen this key?" lookup before either has inserted.
    // The second one then loses the unique index, and that must be read as the
    // same write rather than reported as a failure to the user.
    db.scheduleFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "first-one" });
    db.scheduleCreate.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    const result = await scheduleService.createIdempotent("user-1", {
      ...input,
      clientKey: "sched-race",
    });

    expect(result.deduped).toBe(true);
    expect(result.schedule.id).toBe("first-one");
  });

  it("does not disguise a real database failure as a duplicate", async () => {
    db.scheduleFindFirst.mockResolvedValue(null);
    db.scheduleCreate.mockRejectedValue(
      Object.assign(new Error("connection terminated"), { code: "P1001" })
    );

    // Only P2002 means "you already did this". Anything else is a genuine
    // failure and must surface, or the user is told their timetable synced when
    // it did not.
    await expect(
      scheduleService.createIdempotent("user-1", { ...input, clientKey: "sched-abc" })
    ).rejects.toThrow();
  });

  it("behaves exactly like a plain create when there is no key", async () => {
    db.scheduleFindFirst.mockResolvedValue(null);
    const result = await scheduleService.createIdempotent("user-1", input);

    expect(result.deduped).toBe(false);
    // No key means no extra lookup — the online path is untouched.
    expect(db.scheduleFindFirst).not.toHaveBeenCalled();
  });
});
