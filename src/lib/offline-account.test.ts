import { describe, expect, it, beforeEach } from "vitest";

import {
  getActiveAccountId,
  isScopedTo,
  readLastAccountId,
  scopeKey,
  setActiveAccountId,
  LAST_ACCOUNT_KEY,
  UNSCOPED_PREFIX,
} from "@/lib/offline-account";

/**
 * Account scoping.
 *
 * This is the difference between "two people share a browser profile" being fine
 * and it leaking one person's timetable to the other. Before scoping, every
 * cache key was a plain string, so `schedule:list` written by account A was
 * exactly the row account B read — after a sign-out and a sign-in on the same
 * phone or a shared laptop.
 *
 * The rule being defended: a key is not addressable from another account, while
 * device-wide state still is.
 */
describe("offline account scoping", () => {
  beforeEach(() => {
    setActiveAccountId(null);
  });

  it("gives two accounts different keys for the same logical name", () => {
    setActiveAccountId("alice");
    const aliceKey = scopeKey("schedule:list");
    setActiveAccountId("bob");
    const bobKey = scopeKey("schedule:list");

    expect(aliceKey).not.toBe(bobKey);
    // And the plain name is never what gets stored, or it would still collide.
    expect(aliceKey).not.toBe("schedule:list");
    expect(bobKey).not.toBe("schedule:list");
  });

  it("namespaces even when no account is known", () => {
    // A shared "anonymous" bucket is the exact leak this module closes, so an
    // unknown account gets its own namespace rather than a shared default.
    const key = scopeKey("schedule:list");
    expect(key).not.toBe("schedule:list");
    expect(key).toMatch(/^a:/);
  });

  it("returns the same key for the same account, so a reload still reads its data", () => {
    setActiveAccountId("alice");
    const first = scopeKey("notes:all");
    setActiveAccountId("bob");
    setActiveAccountId("alice");
    expect(scopeKey("notes:all")).toBe(first);
  });

  it("leaves device-wide keys unscoped", () => {
    setActiveAccountId("alice");
    setActiveAccountId("bob");
    // Readiness markers and the Low Data preference must be readable before any
    // account is known, or an offline launch cannot decide what to restore.
    expect(scopeKey(`${UNSCOPED_PREFIX}offline-progress`)).toBe(
      `${UNSCOPED_PREFIX}offline-progress`
    );
    expect(scopeKey(LAST_ACCOUNT_KEY)).toBe(LAST_ACCOUNT_KEY);
  });

  it("recognises which keys belong to an account, for deletion on sign-out", () => {
    setActiveAccountId("alice");
    const key = scopeKey("schedule:list");
    expect(isScopedTo(key, "alice")).toBe(true);
    expect(isScopedTo(key, "bob")).toBe(false);
    expect(isScopedTo(LAST_ACCOUNT_KEY, "alice")).toBe(false);
  });

  it("tracks the active account", () => {
    expect(getActiveAccountId()).toBeNull();
    setActiveAccountId("alice");
    expect(getActiveAccountId()).toBe("alice");
    // An empty string must not become an account named "".
    setActiveAccountId("");
    expect(getActiveAccountId()).toBeNull();
  });

  it("restores the last account from the unscoped pointer", async () => {
    const stored = await readLastAccountId(async (key) => {
      expect(key).toBe(LAST_ACCOUNT_KEY);
      return { value: { accountId: "alice" }, savedAt: 1 };
    });
    expect(stored).toBe("alice");
  });

  it("reports no account rather than throwing when the pointer is missing or broken", async () => {
    await expect(readLastAccountId(async () => null)).resolves.toBeNull();
    await expect(
      readLastAccountId(async () => {
        throw new Error("database blocked");
      })
    ).resolves.toBeNull();
    // A pointer holding something that is not an id must not become a scope.
    await expect(readLastAccountId(async () => ({ value: { accountId: 42 } }))).resolves.toBeNull();
  });
});
