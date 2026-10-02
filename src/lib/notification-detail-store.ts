"use client";

/* Tiny external store sharing the notification detail-open state between the
 * Notifications page (which opens/closes the Gmail-style reader) and the
 * dashboard layout (which hides the top-left avatar button + floating buttons
 * while the reader covers the screen). Mirrors the sidebar openState pattern. */

let detailOpen = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getNotificationDetailSnapshot(): boolean {
  return detailOpen;
}

export function subscribeNotificationDetail(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setNotificationDetailOpen(next: boolean) {
  if (detailOpen === next) return;
  detailOpen = next;
  emit();
}
