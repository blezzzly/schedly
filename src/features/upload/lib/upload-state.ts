"use client";

// Persists an in-flight upload so that leaving the Schedule page (or switching
// tabs / the browser killing the tab / the Android WebView being restarted)
// doesn't kill the "Reading your schedule" progress: the uploadId is stored
// here and the page re-polls it on the next visit.
//
// localStorage is used instead of sessionStorage because aggressive mobile
// browsers (and native WebViews) wipe sessionStorage when they discard or
// restart the page, which is exactly the moment we need the state to survive.
// A TTL keeps a stale record from being resumed forever.
export type UploadResumeState = {
  uploadId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  previewUrl: string | null;
  savedAt?: number;
};

const TTL_MS = 30 * 60 * 1000;

function storageKey(userId: string): string {
  return `schedly-upload-state:${userId}`;
}

export function getUploadState(userId: string): UploadResumeState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UploadResumeState;
    if (typeof parsed.uploadId !== "string" || !parsed.uploadId) {
      window.localStorage.removeItem(storageKey(userId));
      return null;
    }
    if (parsed.savedAt && Date.now() - parsed.savedAt > TTL_MS) {
      window.localStorage.removeItem(storageKey(userId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveUploadState(userId: string, state: UploadResumeState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify({ ...state, savedAt: Date.now() })
    );
  } catch {
    // Storage unavailable — the progress just won't resume.
  }
}

export function clearUploadState(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // Ignore
  }
}

// When the AI is "reading" the photo there is no real percentage from the
// server, so the UI shows an asymptotic climb. The climb's origin timestamp
// is persisted here so that returning to the page resumes the reading
// progress from where it was instead of restarting at 1%.
function processingKey(userId: string): string {
  return `schedly-upload-started:${userId}`;
}

export function getProcessingStarted(userId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(processingKey(userId));
    const ts = raw ? Number(raw) : 0;
    return ts > 0 ? ts : null;
  } catch {
    return null;
  }
}

export function saveProcessingStarted(userId: string, ts: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(processingKey(userId), String(ts));
  } catch {
    // Ignore
  }
}

export function clearProcessingStarted(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(processingKey(userId));
  } catch {
    // Ignore
  }
}