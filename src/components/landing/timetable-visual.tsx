"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * The two-card timetable ("This Week" / "Next Week") shared by both landing
 * entry points, so desktop and mobile show the same thing.
 *
 * Sized in container queries rather than viewport units: on mobile it fills a
 * full-bleed fixed-viewport screen, on desktop it sits in a fluid grid column,
 * and the only reliable way to scale both off one set of numbers is to measure
 * the box it actually lands in.
 */

type Cell = { name: string; color: string } | null;

const GRID_A: Cell[][] = [
  [null, { name: "Phys", color: "#0ea5e9" }, null, { name: "Hist", color: "#ef4444" }, { name: "Eng", color: "#8b5cf6" }, null],
  [{ name: "Math", color: "#3b82f6" }, null, { name: "Bio", color: "#f59e0b" }, null, { name: "CS", color: "#22c55e" }, { name: "Phys", color: "#0ea5e9" }],
  [null, { name: "Eng", color: "#8b5cf6" }, { name: "Math", color: "#3b82f6" }, { name: "CS", color: "#22c55e" }, null, { name: "Hist", color: "#ef4444" }],
];

const GRID_B: Cell[][] = [
  [{ name: "Bio", color: "#f59e0b" }, null, { name: "CS", color: "#22c55e" }, { name: "Phys", color: "#0ea5e9" }, null, { name: "Math", color: "#3b82f6" }],
  [null, { name: "Hist", color: "#ef4444" }, { name: "Eng", color: "#8b5cf6" }, null, { name: "Math", color: "#3b82f6" }, { name: "Bio", color: "#f59e0b" }],
  [{ name: "Eng", color: "#8b5cf6" }, { name: "Phys", color: "#0ea5e9" }, null, { name: "Hist", color: "#ef4444" }, { name: "Bio", color: "#f59e0b" }, null],
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Snappy with a touch of overshoot so the card feels like it's popped forward. */
const HOVER_SPRING = { type: "spring", stiffness: 320, damping: 22, mass: 0.6 } as const;
const REST_SHADOW = "3px 3px 0 0 #401f32";
const HOVER_SHADOW = "7px 7px 0 0 #401f32";

function MiniTimetable({
  grid,
  label,
  side,
  hovered = false,
  dimmed = false,
}: {
  grid: Cell[][];
  label: string;
  side: "back" | "front";
  hovered?: boolean;
  dimmed?: boolean;
}) {
  // The card that lost the hover drifts back along its own diagonal. The hovered
  // card only scales — a moving edge under the cursor flickers the hover off.
  const recede = side === "back" ? { x: -6, y: -10 } : { x: 6, y: 10 };

  return (
    <motion.div
      className="@container mx-auto w-full max-w-2xl rounded-xl border-2 border-foreground/70 bg-card p-1.5 shadow-[3px_3px_0_0_#401f32] will-change-transform @sm:p-2 @xl:p-2.5"
      initial={false}
      animate={{
        scale: hovered ? 1.06 : dimmed ? 0.96 : 1,
        x: dimmed ? recede.x : 0,
        y: dimmed ? recede.y : 0,
        opacity: dimmed ? 0.45 : 1,
        boxShadow: hovered ? HOVER_SHADOW : REST_SHADOW,
      }}
      transition={{
        scale: HOVER_SPRING,
        x: HOVER_SPRING,
        y: HOVER_SPRING,
        boxShadow: HOVER_SPRING,
        // Kept as a plain tween — a spring would overshoot past 0/1.
        opacity: { duration: 0.18, ease: "easeOut" },
      }}
    >
      <div className="mb-1.5 flex items-center gap-1.5 @sm:mb-2 @sm:gap-2">
        <div className="h-2 w-2 rounded-full bg-destructive/60 @sm:h-2.5 @sm:w-2.5" />
        <div className="h-2 w-2 rounded-full bg-yellow-400/60 @sm:h-2.5 @sm:w-2.5" />
        <div className="h-2 w-2 rounded-full bg-green-400/60 @sm:h-2.5 @sm:w-2.5" />
        <span className="ml-1 font-mono text-muted-foreground text-[9px] @sm:text-[10px] @xl:text-[11px]">
          {label}
        </span>
      </div>
      <div
        className="grid gap-0.5 @sm:gap-1"
        style={{ gridTemplateColumns: `repeat(${DAY_LABELS.length}, minmax(0, 1fr))` }}
      >
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="rounded bg-primary/10 p-0.5 text-center font-semibold text-primary text-[9px] @sm:text-[10px] @xl:text-[11px]"
          >
            {d}
          </div>
        ))}
        {grid.map((row, ri) =>
          row.map((cell, ci) => (
            <div key={`${ri}-${ci}`} className="min-h-[30px] @sm:min-h-[36px] @xl:min-h-[44px]">
              {cell ? (
                <div
                  className="flex h-full min-h-[30px] items-center justify-center rounded bg-muted/5 p-0.5 text-center @sm:min-h-[36px] @xl:min-h-[44px]"
                  style={{ backgroundColor: cell.color + "1f", color: cell.color }}
                >
                  <span className="font-semibold leading-tight text-[9px] @sm:text-[10px] @xl:text-[11px]">
                    {cell.name}
                  </span>
                </div>
              ) : (
                <div className="flex h-full min-h-[30px] items-center justify-center rounded bg-muted/30 @sm:min-h-[36px] @xl:min-h-[44px]" />
              )}
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

export function TimetableVisual({
  active = true,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  const [hovered, setHovered] = useState<"back" | "front" | null>(null);

  // Ignore touch/pen so a tap on a phone doesn't leave a card stuck "hovered".
  const handlePointerEnter = (side: "back" | "front") => (e: React.PointerEvent) => {
    setHovered(e.pointerType === "mouse" ? side : null);
  };

  return (
    <div
      className={cn(
        "relative mx-auto h-[clamp(10rem,32dvh,14rem)] w-[clamp(22rem,96vw,30rem)] transition-all duration-500 ease-out",
        active ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {/* Both cards are absolutely positioned siblings, so whichever one is
          hovered is given the higher z-index to jump the stack. */}
      <div
        className={cn(
          "absolute left-2 top-2 w-[80%] -rotate-6 transition-all duration-500 ease-out",
          active ? "translate-x-0 translate-y-0" : "-translate-x-2",
          !active
            ? "opacity-40"
            : hovered === "back"
              ? "z-20 opacity-100"
              : "z-10 opacity-90",
        )}
        onPointerEnter={handlePointerEnter("back")}
        onPointerLeave={() => setHovered(null)}
      >
        <MiniTimetable
          grid={GRID_B}
          label="Next Week"
          side="back"
          hovered={hovered === "back"}
          dimmed={hovered === "front"}
        />
      </div>

      <div
        className={cn(
          "absolute right-2 top-6 w-[80%] rotate-[4deg] transition-all duration-500 ease-out",
          active ? "translate-x-0 translate-y-0" : "translate-x-2",
          !active
            ? "opacity-0"
            : hovered === "front"
              ? "z-20 opacity-100"
              : "z-10 opacity-100",
        )}
        onPointerEnter={handlePointerEnter("front")}
        onPointerLeave={() => setHovered(null)}
      >
        <MiniTimetable
          grid={GRID_A}
          label="This Week"
          side="front"
          hovered={hovered === "front"}
          dimmed={hovered === "back"}
        />
      </div>
    </div>
  );
}