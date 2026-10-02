"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Palette } from "lucide-react";

import { cn } from "@/lib/utils";
import { useThemeConfig, THEME_PRESETS } from "@/features/theme";

const PAGE_SIZE = 3;

export function ThemePicker() {
  const { activeId, setTheme } = useThemeConfig();

  const pageCount = Math.ceil(THEME_PRESETS.length / PAGE_SIZE);
  // Visible page is purely UI state — pagination must NOT change the active
  // theme. Start on the page containing the current active theme.
  const [page, setPage] = useState(
    Math.floor(
      Math.max(0, THEME_PRESETS.findIndex((p) => p.id === activeId)) / PAGE_SIZE,
    ),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        target?.closest("[data-theme-picker]")
      ) {
        e.preventDefault();
        setPage((p) =>
          e.key === "ArrowLeft"
            ? Math.max(0, p - 1)
            : Math.min(pageCount - 1, p + 1),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageCount]);

  const slice = THEME_PRESETS.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Selecting a theme also moves the window to its page so the active check
  // stays in view. This runs at click time (no effect needed).
  const selectTheme = (id: string) => {
    const idx = THEME_PRESETS.findIndex((p) => p.id === id);
    setPage(Math.floor(Math.max(0, idx) / PAGE_SIZE));
    setTheme(id);
  };

  return (
    <div data-theme-picker className="space-y-2 px-3 pb-3">
      <div className="flex items-center gap-2 px-1">
        <Palette className="h-3.5 w-3.5 text-sidebar-foreground/40" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
          Theme
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          aria-label="Previous themes"
          className="flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="grid flex-1 grid-cols-3 items-center justify-items-center gap-1">
          {slice.map((preset) => {
            const isActive = activeId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => selectTheme(preset.id)}
                title={preset.name}
                aria-label={`Theme: ${preset.name}`}
                aria-pressed={isActive}
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200",
                  isActive
                    ? "ring-2 ring-sidebar-primary ring-offset-2 ring-offset-sidebar"
                    : "opacity-50 hover:scale-110 hover:opacity-100"
                )}
                style={{ backgroundColor: preset.swatch }}
              >
                {isActive && (
                  <Check className="h-3.5 w-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]" strokeWidth={3} aria-hidden />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          disabled={page >= pageCount - 1}
          aria-label="Next themes"
          className="flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

