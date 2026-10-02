"use client";

import { useState, useEffect, useRef, useCallback, type ComponentType, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { AppNavPanel } from "@/components/app-nav-panel";
import { Card, CardContent } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { TimerPhaseSwitcher } from "./timer-phase-switcher";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  TreePineIcon,
  TreePine,
  TreeDeciduous,
  Flower2,
  Leaf,
  Sprout,
  FlameIcon,
  ZapIcon,
} from "lucide-react";
import { HeaderAvatar } from "@/components/header-avatar";
import { NotificationBell } from "@/components/notification-bell";
import { toast } from "sonner";
import { friendlyError } from "@/server/lib/friendly-error";
import {
  getGamificationProfile,  logFocusSession,
} from "./gamification-actions";
import { levelProgress } from "@/lib/gamification-levels";
import { cn } from "@/lib/utils";

const DEFAULTS = { focus: 5, break: 5 };
const MAX_FOCUS = 240;
const MAX_BREAK = 120;
const TICK_MS = 250;

// Growth thresholds are FRACTIONS of the current focus session's total duration.
// 0%→Seed, 20%→Sprout, 40%→Sapling, 60%→Tree, 80%→Full Tree, 100%→completion.
// These work for ANY focus duration (seconds, minutes, hours).
const GROWTH_THRESHOLDS = { sprout: 0.20, sapling: 0.40, tree: 0.60, full: 0.80 };

function format(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, n));
}

// `style` is part of the icon's prop type because the glow is driven by an
// inline `filter` that has to animate with the growth. Lucide's own types omit
// it, hence the local widening.
type TreeIcon = ComponentType<{ className?: string; style?: CSSProperties }>;

function getTreeStage(progress: number): { label: string; icon: TreeIcon; color: string; glow: string } {
  if (progress < GROWTH_THRESHOLDS.sprout) return { label: "Seed", icon: Sprout, color: "text-orange-400", glow: "rgb(251 146 60)" };
  if (progress < GROWTH_THRESHOLDS.sapling) return { label: "Sprout", icon: Leaf, color: "text-green-400", glow: "rgb(74 222 128)" };
  if (progress < GROWTH_THRESHOLDS.tree) return { label: "Sapling", icon: Flower2, color: "text-emerald-500", glow: "rgb(16 185 129)" };
  if (progress < GROWTH_THRESHOLDS.full) return { label: "Tree", icon: TreeDeciduous, color: "text-green-600", glow: "rgb(22 163 74)" };
  return { label: "Full Tree", icon: TreePine, color: "text-green-700", glow: "rgb(21 128 61)" };
}


export type PomodoroProfile = {
  xp: number;
  level: number;
  currentStreak: number;
  totalFocusMinutes: number;
} | null;

/**
 * The timer itself.
 *
 * `initialProfile` arrives already resolved from the server component parent,
 * which is the whole reason this file exists separately: fetching the profile
 * in a mount effect meant the stats popped in a beat after the page painted,
 * so the card visibly reflowed. Now they ride along with the HTML and render on
 * the first frame. `loadProfile` is kept only to refresh after XP is awarded,
 * which genuinely can't be known ahead of time.
 */
export function PomodoroView({ initialProfile }: { initialProfile: PomodoroProfile }) {
  const [focusMin, setFocusMin] = useState(DEFAULTS.focus);
  const [breakMin, setBreakMin] = useState(DEFAULTS.break);
  const [phase, setPhase] = useState<"focus" | "break">("focus");
  const [secondsLeft, setSecondsLeft] = useState(DEFAULTS.focus * 60);
  const [running, setRunning] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const phaseRef = useRef(phase);
  const focusRef = useRef(focusMin);
  const breakRef = useRef(breakMin);
  const sessionStartRef = useRef<number | null>(null);
  const completionLockRef = useRef(false);
  const mountedRef = useRef(true);

  // Track the previous tree label so we can animate only on stage changes.
  const prevTreeRef = useRef<string>("");
  const [treePop, setTreePop] = useState(false);

  const [profile, setProfile] = useState<PomodoroProfile>(initialProfile);
  const [xpPopup, setXpPopup] = useState<number | null>(null);

  const loadProfile = useCallback(async () => {
    const p = await getGamificationProfile();
    if (p && mountedRef.current) {
      setProfile({
        xp: p.xp,
        level: p.level,
        currentStreak: p.currentStreak,
        totalFocusMinutes: p.totalFocusMinutes,
      });
    }
  }, []);

  // Only sets the mounted flag now. The profile fetch that used to live here
  // moved to the server parent, so the stats render with the HTML instead of
  // arriving on the frame after it.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
    focusRef.current = focusMin;
    breakRef.current = breakMin;
  }, [phase, focusMin, breakMin]);

  // Reset tree-pop tracker when a new focus session starts so the next stage
  // change animates fresh.
  useEffect(() => {
    if (phase === "focus" && !running) {
      prevTreeRef.current = "";
    }
  }, [phase, running]);

  // Single countdown loop. Cleanup guarantees only one interval is ever alive
  // at a time, so rapid start/pause clicks can't create duplicates.
  useEffect(() => {
    if (!running || deadline === null) return;

    const id = window.setInterval(() => {
      if (!mountedRef.current) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);

      if (remaining > 0 || completionLockRef.current) return;

      // Natural completion. Lock immediately so duplicate interval ticks can't fire this again.
      completionLockRef.current = true;

      const wasFocus = phaseRef.current === "focus";
      const nextPhase: "focus" | "break" = wasFocus ? "break" : "focus";
      const nextDur = nextPhase === "focus" ? focusRef.current : breakRef.current;
      const start = sessionStartRef.current;

      if (wasFocus && start) {
        const mins = Math.max(1, Math.round((Date.now() - start) / 60000));
        logFocusSession(mins, true).then((res) => {
          if (!mountedRef.current) return;
          if (res.success && res.xpEarned && res.xpEarned > 0) {
            setXpPopup(res.xpEarned);
            window.setTimeout(() => {
              if (mountedRef.current) setXpPopup(null);
            }, 3000);
            loadProfile();
          } else if (!res.success && res.error) {
            toast.error(friendlyError(res.error, "gamification"));
          }
        });
        sessionStartRef.current = null;
      } else if (!wasFocus) {
        // Break completed naturally: clear start so the next focus session
        // begins timing fresh from its start.
        sessionStartRef.current = null;
      }

      // Transition to the next phase and arm a new deadline.
      setPhase(nextPhase);
      setSecondsLeft(nextDur * 60);
      setDeadline(Date.now() + nextDur * 60 * 1000);
    }, TICK_MS);

    return () => {
      window.clearInterval(id);
      completionLockRef.current = false;
    };
  }, [running, deadline, loadProfile]);

  // Total duration in seconds for the current phase. Used for both the SVG
  // ring and the per-session tree growth progress calculation.
  const phaseTotal = (phase === "focus" ? focusMin : breakMin) * 60;
  const phaseElapsed = phaseTotal - secondsLeft;
  const phaseProgress = phaseTotal > 0 ? Math.max(0, Math.min(1, phaseElapsed / phaseTotal)) : 0;

  // Tree stage is derived ONLY from the current focus session's progress.
  // During break, the icon isn't shown (showTree=false), so this only matters
  // for the visible state.
  const tree = getTreeStage(phase === "focus" ? phaseProgress : 1);
  const showTree = phase === "focus" && running;

  // Continuous growth within the current stage, 0 at the stage's start and 1 at
  // its end. `getTreeStage` alone only reports which of the five icons to show,
  // which made the tree look like it jumped in four cuts over a 25-minute
  // session. Pairing the stage with this sub-progress means the icon grows the
  // whole way through and the stage crossing is just a change of shape on top of
  // continuous motion.
  const treeGrowth = (() => {
    const p = phase === "focus" ? phaseProgress : 1;
    const marks = [
      0,
      GROWTH_THRESHOLDS.sprout,
      GROWTH_THRESHOLDS.sapling,
      GROWTH_THRESHOLDS.tree,
      GROWTH_THRESHOLDS.full,
      1,
    ];
    for (let i = 0; i < marks.length - 1; i++) {
      const from = marks[i];
      const to = marks[i + 1];
      // Non-null assertions: `i < marks.length - 1` guarantees both indexes are
      // in range, but noUncheckedIndexedAccess still widens them to
      // `number | undefined` because it cannot narrow on the loop bound.
      if (p < to!) {
        const span = to! - from!;
        return span > 0 ? (p - from!) / span : 1;
      }
    }
    return 1;
  })();

  // Trigger pop animation when the visible tree stage changes.
  useEffect(() => {
    if (!showTree) return;
    if (!prevTreeRef.current) {
      prevTreeRef.current = tree.label;
      return;
    }
    if (prevTreeRef.current === tree.label || treePop) return;
    setTreePop(true);
    const id = window.setTimeout(() => {
      if (mountedRef.current) setTreePop(false);
    }, 500);
    return () => window.clearTimeout(id);
  }, [tree.label, showTree, treePop]);

  const timerProgress = phaseTotal > 0 ? (secondsLeft / phaseTotal) * 100 : 0;

  function applyFocus(value: number) {
    const next = clampInt(value, 1, MAX_FOCUS);
    setFocusMin(next);
    if (phase === "focus") {
      setSecondsLeft(next * 60);
      if (running) {
        setDeadline(Date.now() + next * 60 * 1000);
      } else {
        setDeadline(null);
      }
    }
  }

  function applyBreak(value: number) {
    const next = clampInt(value, 1, MAX_BREAK);
    setBreakMin(next);
    if (phase === "break") {
      setSecondsLeft(next * 60);
      if (running) {
        setDeadline(Date.now() + next * 60 * 1000);
      } else {
        setDeadline(null);
      }
    }
  }

  const toggle = () => {
    if (running) {
      // Pausing — preserve remaining time, no seed award.
      const remaining = secondsLeft;
      setRunning(false);
      setDeadline(null);
      // Clear the session-start ref so resuming doesn't double-count.
      if (phaseRef.current === "focus") {
        sessionStartRef.current = null;
      }
      setSecondsLeft(remaining);
    } else {
      // Starting / resuming. Re-arm deadline from current remaining time.
      if (phaseRef.current === "focus" && !sessionStartRef.current) {
        sessionStartRef.current = Date.now();
      }
      setDeadline(Date.now() + Math.max(0, secondsLeft) * 1000);
      setRunning(true);
    }
  };

  const reset = () => {
    setRunning(false);
    setDeadline(null);
    sessionStartRef.current = null;
    completionLockRef.current = false;
    prevTreeRef.current = "";
    setSecondsLeft((phase === "focus" ? focusMin : breakMin) * 60);
  };

  const skip = () => {
    // Manual phase switch — never marks current phase as completed.
    sessionStartRef.current = null;
    const next: "focus" | "break" = phase === "focus" ? "break" : "focus";
    setPhase(next);
    setRunning(false);
    setDeadline(null);
    completionLockRef.current = false;
    prevTreeRef.current = "";
    setSecondsLeft((next === "focus" ? focusMin : breakMin) * 60);
  };

  const switchPhase = (target: "focus" | "break") => {
    if (target === phase) return;
    sessionStartRef.current = null;
    setRunning(false);
    setDeadline(null);
    completionLockRef.current = false;
    prevTreeRef.current = "";
    setPhase(target);
    setSecondsLeft((target === "focus" ? focusMin : breakMin) * 60);
  };

  // How far through the current level the player is. Drives the bar only — the
// "N XP to next level" wording was dropped from this card, so the bar is the
// only place remaining progress is expressed.
  const levelPct = profile ? levelProgress(profile.xp, profile.level) * 100 : 0;

  // Stage progress hint (only meaningful during focus).
  const nextStage =
    tree.label === "Seed" ? `Sprout` :
    tree.label === "Sprout" ? `Sapling` :
    tree.label === "Sapling" ? `Tree` :
    tree.label === "Tree" ? `Full Tree` :
    null;
  const nextThreshold =
    tree.label === "Seed" ? GROWTH_THRESHOLDS.sprout :
    tree.label === "Sprout" ? GROWTH_THRESHOLDS.sapling :
    tree.label === "Sapling" ? GROWTH_THRESHOLDS.tree :
    tree.label === "Tree" ? GROWTH_THRESHOLDS.full :
    1;
  const stagePct = Math.round(phaseProgress * 100);

  return (
    <div className="mx-auto w-full max-w-6xl pt-4 md:pt-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderAvatar />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Focus Timer
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Stay focused, grow your tree, earn XP
            </p>
          </div>
        </div>
        <NotificationBell variant="inline" className="hidden md:flex" />
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">

        <AppNavPanel />
        <div className="min-w-0 flex-1 mx-auto w-full max-w-6xl">
          {/* Its own slim card, kept out of the timer card so the timer is the
              only thing in there. `rounded-2xl` and `py-2.5` mark it out as a
              status strip rather than another content card. */}
          {profile && (
            <Card className="mb-4 rounded-2xl">
              <CardContent className="py-2.5">
                <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <ZapIcon className="h-3.5 w-3.5 text-yellow-500" />
                    {profile.xp} XP
                  </span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <TreePineIcon className="h-3.5 w-3.5 text-green-500" />
                    Lv {profile.level}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <FlameIcon className="h-3.5 w-3.5 text-orange-500" />
                    {profile.currentStreak}d
                  </span>
                </p>

                {/* Plain rect, deliberately not the app's `ProgressBar`: that one
                    is rounded-full with a 2px border and a 2px hard shadow, which
                    is exactly the furniture that was asked to go. Kept as bare
                    markup so there is nothing to restyle later. */}
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(levelPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Level ${profile.level} progress`}
                  className="mt-2 h-1 w-full bg-muted"
                >
                  <div
                    className="h-full bg-primary transition-[width] duration-300 ease-out"
                    style={{ width: `${levelPct}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* No shadow override. `Card` already ships shadow-[3px_3px_0_0_#401f32]; this
              used to bump it to 6px and add a ring, which is the Dialog's
              signature — the reason this one card read heavier and more "placed"
              than every other card on the page. */}
          <Card>
            <CardContent className="flex flex-col items-center gap-6 py-8 lg:flex-row lg:items-stretch lg:gap-10 lg:py-10">
              {/* LEFT column: the phase switcher sits directly above the ring, and
                the ring is the only thing in it. Keeping the switcher inside this
                wrapper is what puts it above the circle — as a direct child of the
                card it became a sibling of the whole column and drifted away from
                the timer. */}
              <div className="flex w-full shrink-0 flex-col items-center gap-6 lg:w-auto">
              <TimerPhaseSwitcher
                phase={phase}
                onSwitch={switchPhase}
              />
              {/* Sized up from h-56 because on desktop the ring has a column of
                its own instead of sitting in a narrow centred stack. */}
              <div className="relative flex h-64 w-64 items-center justify-center sm:h-72 sm:w-72 lg:h-80 lg:w-80">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50" cy="50" r="46"
                    fill="none" stroke="currentColor"
                    className="text-muted/30" strokeWidth="6"
                  />
                  <circle
                    cx="50" cy="50" r="46"
                    fill="none" stroke="currentColor"
                    className="text-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
                    strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 46}
                    strokeDashoffset={(2 * Math.PI * 46) * (1 - timerProgress / 100)}
                  />
                </svg>
                <div className="text-center">
                  {showTree && (
                    /* Two layers, both driven by the same `phaseProgress`:
                       the wrapper scales continuously so the tree visibly fills
                       out over the session instead of jumping between five fixed
                       icons, and the icon inside sways on a slow loop so it reads
                       as alive rather than as a static glyph. The stage pop still
                       fires on a threshold crossing so there is a small kick at
                       each new stage on top of the steady growth. */
                    <div
                      className="mb-1 flex items-center justify-center"
                      style={{
                        transform: `scale(${(0.55 + treeGrowth * 0.45).toFixed(3)})`,
                        transition: "transform 1s linear",
                      }}
                    >
                      <div
                        className={cn(
                          "animate-tree-sway flex items-center justify-center",
                          treePop && "animate-[grow-pop_500ms_ease-out]"
                        )}
                      >
                        <tree.icon
                          className={cn("h-12 w-12", tree.color)}
                          style={{
                            // `tree.glow` is a literal rgb() so it can go straight
                            // into drop-shadow; deriving it from the Tailwind
                            // colour class would emit "orange-400", which is not
                            // a valid CSS colour.
                            filter: `drop-shadow(0 0 ${(treeGrowth * 12).toFixed(1)}px ${tree.glow})`,
                            transition: "filter 1s linear",
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {/* The number is the point of the screen, so it is the largest
                      thing in the card: 5xl on mobile, 7xl once the ring has a
                      column of its own and there is room to spend on it. */}
                  <div className="text-6xl font-bold leading-none tabular-nums text-foreground lg:text-7xl">
                    {format(secondsLeft)}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                    {phase === "focus"
                      ? running ? tree.label : "Focus session"
                      : "Break time"}
                  </div>
                </div>
              </div>

              </div>

              {/* RIGHT (desktop): everything you touch. Centred and stacked on
                  mobile, a left-aligned column beside the ring from lg up.

                  `order-last` is what puts it after the ring on desktop while
                  still reading first-to-last on mobile — the ring is the subject,
                  the controls are the follow-up. The switcher above sets its own
                  `order-first` so it stays at the top of the card on mobile and
                  moves into the row on desktop. */}
              <div className="flex w-full flex-1 flex-col items-center gap-6 lg:items-stretch lg:gap-7">

              {xpPopup && (
                <p className="self-center text-sm font-bold text-green-600 dark:text-green-500 lg:self-start">
                  +{xpPopup} XP earned!
                </p>
              )}

              {/* Tree progress. Plain text, no border and no shadow: this used to be a
                  bordered `bg-card` chip with its own 3px offset, which made it
                  read as a second card nested inside the timer card — and the
                  only thing on the page wearing three hard shadows at once
                  (page card, chip, and the button row beneath it). It is
                  supporting information, not a target, so it now sits as
                  caption text. */}
              {showTree && (
                <div className="text-center">
                  <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-foreground">
                    <tree.icon className={cn("h-4 w-4", tree.color)} />
                    {tree.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {nextStage
                      ? `${stagePct}% · ${Math.max(0, Math.round((nextThreshold - phaseProgress) * 100))}% to ${nextStage}`
                      : "Maximum grown!"}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-center gap-3 lg:justify-start">
                {/* Each control springs on its own click. The key changes with the
                    label so the Start button replays the spring when it becomes
                    Pause and vice versa — a transition that only fires on change,
                    so it never loops as distraction during a session. */}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={reset}
                  aria-label="Reset"
                  className="active:animate-btn-spring-sm"
                >
                  <RotateCcw className="h-5 w-5" />
                </Button>
                <Button
                  key={running ? "pause" : "start"}
                  size="lg"
                  onClick={toggle}
                  className="w-32 active:animate-btn-spring"
                >
                  {running ? (
                    <><Pause className="mr-2 h-5 w-5" /> Pause</>
                  ) : (
                    <><Play className="mr-2 h-5 w-5" /> Start</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={skip}
                  aria-label="Skip"
                  className="active:animate-btn-spring-sm"
                >
                  <SkipForward className="h-5 w-5" />
                </Button>
              </div>

              {/* Both fields share one capped row instead of stretching across the whole
                  column. They are set-and-forget numbers, not the content of the
                  page — at full width the two inputs read as the main form and
                  competed with the timer sitting next to them. Centred on mobile,
                  left-aligned under the buttons on desktop. */}
              <div className="mx-auto grid w-full max-w-xs grid-cols-2 gap-3 lg:mx-0">
                <TextField
                  label="Focus (min)"
                  inputClassName="text-center"
                  type="number" min={1} max={MAX_FOCUS} value={focusMin}
                  onChange={(e) => applyFocus(Number(e.target.value))}
                />
                <TextField
                  label="Break (min)"
                  inputClassName="text-center"
                  type="number" min={1} max={MAX_BREAK} value={breakMin}
                  onChange={(e) => applyBreak(Number(e.target.value))}
                />
              </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

