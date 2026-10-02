"use client";

import { createContext, useContext, useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { THEME_PRESETS, DEFAULT_THEME_ID, type ThemePreset } from "./presets";

type ThemeContextValue = {
  activeId: string;
  activePreset: ThemePreset;
  setTheme: (id: string) => void;
  themeVars: React.CSSProperties;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "schedly-theme";
const THEME_COOKIE = "schedly-theme";

function getStoredId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEME_PRESETS.some((p) => p.id === stored)) return stored;
  } catch {}
  try {
    const match = document.cookie.split("; ").find((c) => c.startsWith(`${THEME_COOKIE}=`));
    const value = match?.split("=")[1];
    if (value && THEME_PRESETS.some((p) => p.id === value)) return value;
  } catch {}
  return DEFAULT_THEME_ID;
}

function setStoredId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {}
  try {
    document.cookie = `${THEME_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
  } catch {}
}

function presetToVars(preset: ThemePreset): React.CSSProperties {
  return Object.fromEntries(Object.entries(preset.vars)) as React.CSSProperties;
}

// External store for the persisted theme id. The snapshot comes from
// localStorage/cookies on the client, and from the `initialThemeId` prop
// (server reads the cookie in the root layout) during SSR — so hydration
// renders identical CSS variables with no mismatch.
const themeListeners = new Set<() => void>();

function subscribe(listener: () => void) {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

function getSnapshot(): string {
  return getStoredId();
}

function emit() {
  themeListeners.forEach((listener) => listener());
}

export function ThemeProvider({
  children,
  initialThemeId,
}: {
  children: React.ReactNode;
  initialThemeId?: string;
}) {
  const getServerSnapshot = useCallback(
    () =>
      initialThemeId && THEME_PRESETS.some((p) => p.id === initialThemeId)
        ? initialThemeId
        : DEFAULT_THEME_ID,
    [initialThemeId],
  );

  const activeId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((id: string) => {
    const preset = THEME_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setStoredId(id);
    emit();
  }, []);

  const activePreset = useMemo(
    () => THEME_PRESETS.find((p) => p.id === activeId) ?? THEME_PRESETS[0]!,
    [activeId],
  );

  // Apply the theme's CSS variables to <html> too — the dashboard layout only
  // sets them on a wrapper <div>, but portals (dialogs, popovers, toasts)
  // render at the document root OUTSIDE that div. Mirroring the vars on
  // documentElement lets every portal inherit the user's chosen theme.
  useEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(activePreset.vars)) {
      root.style.setProperty(key, value);
    }
  }, [activePreset]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      activeId,
      activePreset,
      setTheme,
      themeVars: presetToVars(activePreset),
    }),
    [activeId, activePreset, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeConfig() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeConfig must be used within ThemeProvider");
  return ctx;
}
