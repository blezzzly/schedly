import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  getOfflineStatus,
  resetOfflineStatus,
  setOfflineStatus,
  summarizeStatus,
  subscribeOfflineStatus,
  type OfflineStatus,
} from "@/lib/offline-status";

/**
 * What the app tells the user about its connection.
 *
 * These are the promises the offline spec makes about the interface, and the
 * failure mode they exist to prevent: showing "Online" over a screen where
 * every request is failing, or an endless spinner where there is perfectly good
 * cached data. Both read to a user as "Schedly is broken" rather than "you are
 * offline", which is a different problem with a different fix.
 */
describe("offline status", () => {
  beforeEach(() => {
    resetOfflineStatus();
  });

  it("says nothing at all when everything is fine", () => {
    // A permanent banner teaches people to ignore it. Healthy must be silent.
    setOfflineStatus({ connection: "online", sync: "idle", pending: 0 });
    expect(summarizeStatus(getOfflineStatus())).toBeNull();
  });

  it("explains offline with cached data instead of showing an error", () => {
    setOfflineStatus({ connection: "offline", sync: "idle", pending: 0, prepared: true });
    const summary = summarizeStatus(getOfflineStatus());
    expect(summary?.tone).toBe("info");
    expect(summary?.label).toMatch(/Offline/);
    // It has to say the data is real, or "Offline" alone reads as an error.
    expect(summary?.detail).toMatch(/saved on this device/i);
  });

  it("says plainly that offline changes are safe and will be sent later", () => {
    setOfflineStatus({ connection: "offline", sync: "idle", pending: 3, prepared: true });
    const summary = summarizeStatus(getOfflineStatus());
    expect(summary?.detail).toContain("3 changes");
    expect(summary?.detail).toMatch(/sync when you are back online/i);
  });

  it("warns when offline preparation is incomplete", () => {
    setOfflineStatus({ connection: "offline", sync: "idle", pending: 0, prepared: false });
    const summary = summarizeStatus(getOfflineStatus());
    expect(summary?.detail).toMatch(/not finished saving/i);
  });

  it("announces a sync in progress with what it is sending", () => {
    setOfflineStatus({ connection: "online", sync: "syncing", pending: 2 });
    const summary = summarizeStatus(getOfflineStatus());
    expect(summary?.label).toMatch(/Syncing/);
    expect(summary?.detail).toContain("2 changes");
  });

  it("tells the user their work survives an expired session", () => {
    setOfflineStatus({ connection: "online", sync: "auth-required", pending: 1 });
    const summary = summarizeStatus(getOfflineStatus());
    expect(summary?.label).toMatch(/Sign in/);
    // This is the reassuring half, and the one that matters: the alternative
    // reading is "your work is gone".
    expect(summary?.detail).toMatch(/safe on this device/i);
  });

  it("surfaces a failure with its reason", () => {
    setOfflineStatus({
      connection: "online",
      sync: "failed",
      pending: 1,
      lastError: "Could not reach the server.",
    });
    const summary = summarizeStatus(getOfflineStatus());
    expect(summary?.tone).toBe("error");
    expect(summary?.detail).toBe("Could not reach the server.");
  });

  it("reassures about a pending change even before a failure", () => {
    setOfflineStatus({ connection: "online", sync: "failed", pending: 1, lastError: null });
    expect(summarizeStatus(getOfflineStatus())?.detail).toMatch(/safe on this device/i);
  });

  it("puts a storage problem above everything else", () => {
    // If the device cannot store anything, the pending count is beside the
    // point: the work cannot be kept at all.
    setOfflineStatus({
      connection: "online",
      sync: "idle",
      pending: 0,
      storageError: "This device is out of storage space.",
    });
    const summary = summarizeStatus(getOfflineStatus());
    expect(summary?.tone).toBe("error");
    expect(summary?.label).toBe("Storage unavailable");
  });

  it("mentions work waiting even when nothing has gone wrong", () => {
    setOfflineStatus({ connection: "online", sync: "idle", pending: 1 });
    const summary = summarizeStatus(getOfflineStatus());
    expect(summary?.tone).toBe("info");
    expect(summary?.label).toContain("1 change");
  });
});

describe("offline status store", () => {
  beforeEach(() => {
    resetOfflineStatus();
  });

  it("notifies subscribers when something changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOfflineStatus(listener);
    setOfflineStatus({ connection: "offline" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setOfflineStatus({ connection: "online" });
    // Unsubscribed: no more calls, so a torn-down component cannot loop.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps snapshot identity stable when nothing changed", () => {
    setOfflineStatus({ connection: "offline", pending: 2 });
    const before = getOfflineStatus();
    // Re-asserting the same values is what the interval heartbeat and the queue
    // both do constantly. `useSyncExternalStore` compares by reference, so a new
    // object here would re-render the indicator forever.
    setOfflineStatus({ connection: "offline", pending: 2 });
    expect(getOfflineStatus()).toBe(before);
  });

  it("produces a new snapshot, with a new revision, when something does change", () => {
    const before = getOfflineStatus();
    setOfflineStatus({ connection: "offline" });
    const after = getOfflineStatus();
    expect(after).not.toBe(before);
    expect(after.revision).toBeGreaterThan(before.revision);
  });

  it("ignores an undefined patch rather than blanking a field", () => {
    setOfflineStatus({ connection: "offline", pending: 4 });
    setOfflineStatus({ lastError: undefined });
    const status: OfflineStatus = getOfflineStatus();
    expect(status.connection).toBe("offline");
    expect(status.pending).toBe(4);
  });

  it("does not read a never-measured device as a broken one", () => {
    // `null` means "not checked yet", which is different from `false`.
    expect(getOfflineStatus().prepared).toBeNull();
    setOfflineStatus({ prepared: false });
    expect(getOfflineStatus().prepared).toBe(false);
  });
});
