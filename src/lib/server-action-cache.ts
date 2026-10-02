"use client";

/* Client-side dedupe for server actions. Multiple components (dashboard
 * layout, page cards, notifications) fetch the same schedule/reminder data on
 * every navigation. This collapses those into ONE in-flight request per key
 * within a short window, cutting redundant serverless invocations and the
 * latency each one adds. Failed calls are dropped from the cache so a retry
 * actually re-runs the action. */

const cache = new Map<string, { at: number; promise: Promise<unknown> }>();

export function cachedAction<T>(key: string, fn: () => Promise<T>, ttlMs = 15_000): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < ttlMs) {
    return hit.promise as Promise<T>;
  }
  const promise = fn().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { at: now, promise });
  return promise;
}
