// Open/closed state for the quick-add (capture) bottom sheet.
//
// A tiny external store, same pattern as `sidebar-drawer.ts`, so the bottom
// nav button and the sheet itself don't have to be parent/child. It also keeps
// the sheet closed during SSR — rendering an open sheet on the server would
// paint it over the page before hydration.

let openState = false;
const listeners = new Set<() => void>();

export function getQuickAddSnapshot(): boolean {
  return openState;
}

export function getQuickAddServerSnapshot(): boolean {
  return false;
}

export function subscribeQuickAdd(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setQuickAddOpen(next: boolean) {
  if (openState === next) return;
  openState = next;
  listeners.forEach((l) => l());
}

export function openQuickAdd() {
  setQuickAddOpen(true);
}

export function closeQuickAdd() {
  setQuickAddOpen(false);
}
