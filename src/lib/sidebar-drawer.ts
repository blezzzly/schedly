// Shared sidebar drawer state. The drawer's open state lives in a tiny
// external store so its initial value can come from matchMedia only AFTER
// hydration. The server renders "closed" by default — otherwise narrow
// (mobile) windows would paint the open sidebar briefly during SSR, then slide
// it shut right after hydration. On desktop the drawer slides open once
// hydration computes the true viewport, with no hydration mismatch.

let openState: boolean | null = null;
const openListeners = new Set<() => void>();

export function getOpenSnapshot(): boolean {
  if (openState === null) {
    openState = window.matchMedia("(min-width: 768px)").matches;
  }
  return openState;
}

export function subscribeOpen(listener: () => void) {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

export function setOpen(next: boolean) {
  openState = next;
  openListeners.forEach((l) => l());
}

export function toggleOpen() {
  setOpen(!getOpenSnapshot());
}
