import type { ExtractedClass } from "@/features/upload/hooks/use-upload";

export type DesignState = {
  classes: ExtractedClass[];
  imageUrl?: string;
};

const STORAGE_KEY = "schedly-design-state";

const listeners = new Set<() => void>();
let loaded = false;
let cached: DesignState | null = null;

function readStorage(): DesignState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DesignState) : null;
  } catch {
    return null;
  }
}

export function saveDesignState(state: DesignState): boolean {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    return false;
  }
  cached = state;
  loaded = true;
  listeners.forEach((l) => l());
  return true;
}

export function subscribeDesignState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDesignStateSnapshot(): DesignState | null {
  if (typeof window === "undefined") return null;
  if (!loaded) {
    cached = readStorage();
    loaded = true;
  }
  return cached;
}

export function getDesignStateServerSnapshot(): DesignState | null {
  return null;
}
