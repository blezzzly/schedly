import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

/**
 * Replay behaviour of the offline write queue.
 *
 * These cover the promises the offline spec actually makes and that are easy to
 * break silently:
 *
 *  - a write that fails is retried, not dropped;
 *  - a write that the server refuses is dropped, not retried forever;
 *  - retries back off, and the backoff is jittered so a crowd of devices does
 *    not retry in lockstep;
 *  - an entry the browser cannot do yet is left alone;
 *  - an expired session keeps the work instead of destroying it.
 *
 * The IndexedDB layer is stubbed rather than mocked module-wide, because the
 * interesting logic is the ordering and retry policy above it, and a real
 * fake-indexeddb would add a dependency to test something that does not need
 * one. `fake-indexeddb` is deliberately not added to this project.
 */

const queue = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    reset() {
      rows.clear();
    },
  };
});

// The active account lives in its own module — that is the point of it, so it
// has to be mocked there rather than through the cache layer that re-exports it.
vi.mock("@/lib/offline-account", () => ({
  getActiveAccountId: vi.fn(() => "user-1"),
  setActiveAccountId: vi.fn(),
  scopeKey: vi.fn((k: string) => k),
  isScopedTo: vi.fn(() => false),
  readLastAccountId: vi.fn(async () => "user-1"),
  LAST_ACCOUNT_KEY: "meta:last-account",
  UNSCOPED_PREFIX: "meta:",
}));

vi.mock("@/lib/offline-cache", () => ({
  queueDelete: vi.fn(async (id: string) => {
    queue.rows.delete(id);
  }),
  queueGetAll: vi.fn(async () => Array.from(queue.rows.values())),
  queueCount: vi.fn(async () => queue.rows.size),
  queuePut: vi.fn(async (entry: { id: string }) => {
    queue.rows.set(entry.id, entry);
  }),
  queuePatch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    const current = queue.rows.get(id);
    if (current) queue.rows.set(id, { ...current, ...patch });
  }),
  cacheRead: vi.fn(async () => null),
  cacheWrite: vi.fn(async () => {}),
  cacheRemove: vi.fn(async () => {}),
  isNetworkError: vi.fn(() => false),
  isOffline: vi.fn(() => false),
}));

vi.mock("@/lib/offline-status", () => ({
  getOfflineStatus: vi.fn(() => ({ connection: "online", revision: 0 })),
  setOfflineStatus: vi.fn(),
}));

import {
  backoffDelayMs,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  enqueueOfflineWrite,
  flushOfflineWrites,
  listPendingWrites,
  registerOfflineHandler,
  dropPendingWrite,
  probeReachability,
  resetReachabilityProbe,
  authRequired,
} from "@/lib/offline-queue";

/** A transport failure: we never got an answer. */
const transportError = () => Object.assign(new Error("Failed to fetch"), { name: "TypeError" });

describe("offline queue — backoff", () => {
  it("grows with each attempt", () => {
    const delays = [1, 2, 3, 4].map((n) => backoffDelayMs(n, () => 0.5));
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
    }
  });

  it("never exceeds the ceiling, however many attempts have failed", () => {
    for (let n = 1; n <= 40; n++) {
      // The top of the jitter range, so the worst case is what is asserted.
      expect(backoffDelayMs(n, () => 1)).toBeLessThanOrEqual(MAX_BACKOFF_MS);
    }
  });

  it("stays within the jitter band around the nominal delay", () => {
    // Equal jitter: half the computed delay is fixed, half is random. The floor
    // is what stops full-jitter picking ~0 and producing a tight retry loop.
    const nominal = Math.min(BASE_BACKOFF_MS, MAX_BACKOFF_MS);
    expect(backoffDelayMs(1, () => 0)).toBe(nominal / 2);
    expect(backoffDelayMs(1, () => 1)).toBe(nominal);
    expect(backoffDelayMs(1, () => 0.5)).toBe(Math.round(nominal * 0.75));
  });

  it("spreads retries rather than aligning them", () => {
    // Every device that lost connectivity at the same moment computes the same
    // nominal delay. Without jitter they would all retry at the same instant
    // and hit the server as one spike.
    const random = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.25)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.75)
      .mockReturnValueOnce(1);
    const seen = new Set<string>();
    while (random.mock.calls.length < 200) {
      seen.add(String(backoffDelayMs(3, random)));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("treats a nonsensical attempt count as the first attempt", () => {
    expect(backoffDelayMs(0, () => 0.5)).toBe(backoffDelayMs(1, () => 0.5));
    expect(backoffDelayMs(-3, () => 0.5)).toBe(backoffDelayMs(1, () => 0.5));
  });
});

describe("offline queue — replay", () => {
  beforeEach(() => {
    queue.reset();
    resetReachabilityProbe();
    vi.restoreAllMocks();
    // Online by default; individual tests override to model a dead connection.
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends queued writes in the order they were made", async () => {
    const order: string[] = [];
    registerOfflineHandler("k", async (payload: never) => {
      order.push(String((payload as { n: number }).n));
    });
    await enqueueOfflineWrite("k", { n: 1 }, "first");
    await enqueueOfflineWrite("k", { n: 2 }, "second");
    await enqueueOfflineWrite("k", { n: 3 }, "third");

    // createdAt is Date.now(), so space them to make the order unambiguous.
    const entries = await listPendingWrites();
    entries.forEach((e, i) => queue.rows.set(e.id, { ...e, createdAt: 1000 + i }));

    const result = await flushOfflineWrites();
    expect(order).toEqual(["1", "2", "3"]);
    expect(result.sent).toBe(3);
    expect(await listPendingWrites()).toHaveLength(0);
  });

  it("keeps a write that could not be delivered, and records the attempt", async () => {
    registerOfflineHandler("k", async () => {
      throw transportError();
    });
    await enqueueOfflineWrite("k", {}, "my timetable");

    const result = await flushOfflineWrites();
    expect(result.sent).toBe(0);
    const left = await listPendingWrites();
    expect(left).toHaveLength(1);
    expect(left[0]!.attempts).toBe(1);
    // A future retry time is what actually enforces the backoff.
    expect(left[0]!.nextAttemptAt).toBeGreaterThan(Date.now() - 1);
  });

  it("does not retry an entry whose backoff has not elapsed", async () => {
    const send = vi.fn(async () => {});
    registerOfflineHandler("k", send);
    const entry = await enqueueOfflineWrite("k", {}, "later");
    // Simulate an entry that just failed and is waiting.
    queue.rows.set(entry.id, {
      ...entry,
      attempts: 2,
      nextAttemptAt: Date.now() + 60_000,
    });

    const result = await flushOfflineWrites();
    expect(send).not.toHaveBeenCalled();
    expect(result.deferred).toBe(1);
    expect(await listPendingWrites()).toHaveLength(1);
  });

  it("drops an entry the server refused, and does not block the ones behind it", async () => {
    const sent: string[] = [];
    registerOfflineHandler("refused", async () => {
      throw Object.assign(new Error("Validation failed"), { permanent: true });
    });
    registerOfflineHandler("ok", async (payload: never) => {
      sent.push((payload as { n: string }).n);
    });

    await enqueueOfflineWrite("ok", { n: "first" }, "a");
    const bad = await enqueueOfflineWrite("refused", {}, "b");
    await enqueueOfflineWrite("ok", { n: "third" }, "c");
    const entries = await listPendingWrites();
    entries.forEach((e, i) => queue.rows.set(e.id, { ...e, createdAt: 1000 + i }));
    expect(bad).toBeTruthy();

    const result = await flushOfflineWrites();
    expect(result.sent).toBe(2);
    // The refused entry is gone; the good one behind it still went.
    expect(sent).toEqual(["first", "third"]);
    expect(await listPendingWrites()).toHaveLength(0);
  });

  it("leaves an entry alone when nothing knows how to perform it", async () => {
    registerOfflineHandler("known", async () => {});
    await enqueueOfflineWrite("known", {}, "a");
    await enqueueOfflineWrite("unknown-kind", {}, "b");

    const result = await flushOfflineWrites();
    // Deleting here would lose a timetable because of which route the user was
    // standing on. The known one still goes; the unknown one is kept.
    expect(result.sent).toBe(1);
    const left = await listPendingWrites();
    expect(left).toHaveLength(1);
    expect(left[0]!.kind).toBe("unknown-kind");
  });

  it("keeps work whose session expired, and stops before the rest", async () => {
    const second = vi.fn(async () => {});
    registerOfflineHandler("needs-auth", async () => {
      throw authRequired("Unauthorized");
    });
    registerOfflineHandler("other", second);
    await enqueueOfflineWrite("needs-auth", {}, "timetable");
    await enqueueOfflineWrite("other", {}, "note");
    const entries = await listPendingWrites();
    entries.forEach((e, i) => queue.rows.set(e.id, { ...e, createdAt: 1000 + i }));

    const result = await flushOfflineWrites();
    expect(result.authRequired).toBe(true);
    // Both remain: an expired cookie is not a reason to destroy unsynced work,
    // and the second would have failed identically.
    expect(await listPendingWrites()).toHaveLength(2);
    expect(second).not.toHaveBeenCalled();
  });

  it("attempts nothing at all when the browser reports no network", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const send = vi.fn(async () => {});
    registerOfflineHandler("k", send);
    await enqueueOfflineWrite("k", {}, "a");

    const result = await flushOfflineWrites();
    expect(result.skipped).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it("spends one probe instead of a request per entry when the server is down", async () => {
    // This is the whole reason the probe exists. Without it, a phone reporting
    // itself online while every request fails would fire one doomed request per
    // queued write — the exact data cost Low Data Mode exists to avoid.
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    registerOfflineHandler("k", vi.fn(async () => {}));
    await enqueueOfflineWrite("k", {}, "a");
    await enqueueOfflineWrite("k", {}, "b");
    await enqueueOfflineWrite("k", {}, "c");

    const result = await flushOfflineWrites();
    expect(result.skipped).toBe(true);
    expect(result.sent).toBe(0);
    // One cheap probe, not three doomed writes.
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    expect(await listPendingWrites()).toHaveLength(3);
  });

  it("reports the server as unreachable rather than assuming navigator.onLine", async () => {
    // The flag says online. The server says otherwise. The server is right.
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    await expect(probeReachability(true)).resolves.toBe("offline");
  });

  it("treats a server error as reachable, because the server answered", async () => {
    // A 500 means the request got through. Marking that "offline" would hide a
    // real server problem behind a connectivity message.
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as typeof fetch;
    await expect(probeReachability(true)).resolves.toBe("online");
  });

  it("stamps every queued write with the account that made it", async () => {
    const entry = await enqueueOfflineWrite("k", {}, "a");
    // Without this, a write queued offline by one account could be replayed
    // after a different account signs in on the same device.
    expect(entry.accountId).toBe("user-1");
  });

  it("carries a stable idempotency key across retries of the same write", async () => {
    const key = "sched-abc123";
    const entry = await enqueueOfflineWrite(
      "schedule.create",
      { title: "BSIT" },
      "schedule",
      { idempotencyKey: key }
    );
    // The same key on every retry is what lets the server recognise a replay
    // instead of creating a second timetable.
    expect(entry.idempotencyKey).toBe(key);

    const failed = { ...entry, attempts: 1, nextAttemptAt: 0 };
    queue.rows.set(entry.id, failed);
    await flushOfflineWrites();
    const retried = (await listPendingWrites())[0]!;
    expect(retried.idempotencyKey).toBe(key);
  });

  it("lets a user discard an entry they do not want sent", async () => {
    const entry = await enqueueOfflineWrite("k", {}, "a");
    await dropPendingWrite(entry.id);
    expect(await listPendingWrites()).toHaveLength(0);
  });
});
