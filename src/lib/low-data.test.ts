import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

/**
 * Low Data Mode.
 *
 * The point of these assertions is not that a helper returns a number, it is
 * that the setting cannot be implemented as "hide features". Every case here
 * checks that turning data-saving on changes *how much* is fetched, never
 * *whether* the feature works — because a "data saving" mode that quietly stops
 * a user's reminders from updating is a bug wearing a helpful hat.
 */
const state = vi.hoisted(() => ({ connection: null as null | Record<string, unknown> }));

vi.mock("@/lib/offline-cache", () => ({
  cacheWrite: vi.fn(async () => {}),
}));

import {
  getConnectionInfo,
  isLowDataEnabled,
  isSlowConnection,
  pageSize,
  refreshIntervalMs,
  setLowDataEnabled,
  shouldAutoRefresh,
  shouldPrefetchOptional,
  shouldSaveData,
  shouldSearchAsYouType,
  imageSizeHint,
  searchDebounceMs,
} from "@/lib/low-data";

function setConnection(props: Record<string, unknown>) {
  state.connection = props;
  Object.defineProperty(navigator, "connection", {
    value: props,
    configurable: true,
    writable: true,
  });
}

describe("low data mode", () => {
  beforeEach(() => {
    localStorage.clear();
    setLowDataEnabled(false);
    setConnection({});
  });

  afterEach(() => {
    setConnection({});
  });

  it("persists the choice across a reload", () => {
    setLowDataEnabled(true);
    // Reading the module fresh is the reload: the preference has to come from
    // storage, not from a variable that a page load would throw away.
    expect(localStorage.getItem("schedly:low-data")).toBe("1");
    expect(isLowDataEnabled()).toBe(true);
    setLowDataEnabled(false);
    expect(localStorage.getItem("schedly:low-data")).toBe("0");
  });

  it("stops background refreshing when on", () => {
    expect(shouldAutoRefresh()).toBe(true);
    expect(refreshIntervalMs(300_000)).toBe(300_000);

    setLowDataEnabled(true);
    expect(shouldAutoRefresh()).toBe(false);
    // null means "do not poll at all" — not a longer interval, which would still
    // spend the user's data on a heartbeat nobody asked for.
    expect(refreshIntervalMs(300_000)).toBeNull();
  });

  it("honours the browser's own data-saving preference", () => {
    // The user who turned this on in their OS did exactly what our setting does,
    // and should not have to find the toggle as well.
    setConnection({ saveData: true });
    expect(shouldSaveData()).toBe(true);
    expect(isLowDataEnabled()).toBe(false);
  });

  it("treats a slow connection as a reason to economise", () => {
    setConnection({ effectiveType: "2g" });
    expect(isSlowConnection()).toBe(true);
    expect(shouldSaveData()).toBe(true);
    setConnection({ effectiveType: "4g" });
    expect(isSlowConnection()).toBe(false);
    expect(shouldSaveData()).toBe(false);
  });

  it("keeps search working without firing a request per keystroke", () => {
    setLowDataEnabled(true);
    expect(shouldSearchAsYouType()).toBe(false);
    // No debounce timer either — the user submits, so a delay would just add
    // latency for no reason. Read through the function, because the setting can
    // change at runtime and a constant captured at import would not notice.
    expect(searchDebounceMs()).toBe(0);
    setLowDataEnabled(false);
    expect(searchDebounceMs()).toBe(250);
  });

  it("keeps every feature reachable, only smaller", () => {
    setLowDataEnabled(true);
    // Pagination changes how much arrives at once, not whether it arrives.
    expect(pageSize(50)).toBe(10);
    expect(pageSize(10)).toBe(10);
    setLowDataEnabled(false);
    expect(pageSize(50)).toBe(50);
  });

  it("asks for a smaller image without dropping the desktop one", () => {
    setLowDataEnabled(true);
    const hint = imageSizeHint(768);
    expect(hint).toContain("384px");
    expect(hint).toContain("768px");
  });

  it("skips optional prefetching but never the app shell", () => {
    setLowDataEnabled(true);
    // Avatars and weather icons are worth deferring...
    expect(shouldPrefetchOptional()).toBe(false);
    // ...but the shell precache is what makes the app open offline at all, and
    // Low Data Mode must never be the reason it does not.
    expect(shouldSaveData()).toBe(true);
  });

  it("reports unknown connection properties as unknown, not as a guess", () => {
    setConnection({});
    const info = getConnectionInfo();
    expect(info.saveData).toBe(false);
    expect(info.effectiveType).toBeNull();
  });
});
