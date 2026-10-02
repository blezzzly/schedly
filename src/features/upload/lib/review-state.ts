"use client";

import type { ExtractedClass } from "../hooks/use-upload";
import type { ValidationIssue } from "@/server/services/validation.service";

export type ReviewState = {
  classes: ExtractedClass[];
  confidence: number | null;
  validationIssues: ValidationIssue[];
};

// localStorage (not sessionStorage): mobile browsers / native WebViews wipe
// sessionStorage when a tab is discarded or the app restarts, so the review
// would be lost mid-flow. A TTL avoids resurrecting a stale review.
const TTL_MS = 24 * 60 * 60 * 1000;

function storageKey(userId: string): string {
  return `schedly-review-state:${userId}`;
}

function imageKey(userId: string): string {
  return `schedly-review-image:${userId}`;
}

function fresh<K extends string>(key: K, raw: string): boolean {
  const parsed = JSON.parse(raw) as { savedAt?: number };
  return !parsed.savedAt || Date.now() - parsed.savedAt <= TTL_MS;
}

export function getReviewState(userId: string): ReviewState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    if (!fresh(storageKey(userId), raw)) {
      clearReviewState(userId);
      return null;
    }
    const parsed = JSON.parse(raw) as ReviewState;
    return Array.isArray(parsed.classes) ? parsed : null;
  } catch {
    return null;
  }
}

export function getReviewImage(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(imageKey(userId));
  } catch {
    return null;
  }
}

export function saveReviewState(userId: string, state: ReviewState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify({ ...state, savedAt: Date.now() })
    );
  } catch {
    // Storage full or unavailable — the review just won't resume.
  }
}

export function saveReviewImage(userId: string, url: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(imageKey(userId), url);
  } catch {
    // The image can be larger than the storage quota; the classes still resume.
  }
}

export function clearReviewState(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(userId));
    window.localStorage.removeItem(imageKey(userId));
  } catch {
    // Ignore
  }
}