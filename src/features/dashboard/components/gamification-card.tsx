"use client";

import { useState, useEffect } from "react";
import { getGamificationProfile } from "@/app/(dashboard)/pomodoro/gamification-actions";
import { levelProgress as getLevelProgress } from "@/lib/gamification-levels";
import { ZapIcon, FlameIcon, TimerIcon } from "lucide-react";

type Profile = {
  xp: number;
  level: number;
  currentStreak: number;
  totalFocusMinutes: number;
} | null;

export function GamificationCard() {
  const [profile, setProfile] = useState<Profile>(null);

  useEffect(() => {
    getGamificationProfile().then((p) => {
      if (p) {
        setProfile({
          xp: p.xp,
          level: p.level,
          currentStreak: p.currentStreak,
          totalFocusMinutes: p.totalFocusMinutes,
        });
      }
    });
  }, []);

  if (!profile) return null;

  const progress = getLevelProgress(profile.xp, profile.level);
  const hours = Math.floor(profile.totalFocusMinutes / 60);
  const mins = profile.totalFocusMinutes % 60;

  return (
    <div className="rounded-xl border-2 border-foreground/70 bg-primary/5 p-3 shadow-[3px_3px_0_0_#401f32]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-sidebar-foreground">Level {profile.level}</span>
        <span className="text-[10px] font-bold text-primary">{Math.round(progress * 100)}%</span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted mb-3">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <div className="flex flex-col items-center rounded-lg bg-background/50 py-1.5 px-1">
          <FlameIcon className="h-3 w-3 text-orange-500 mb-0.5" />
          <span className="text-xs font-bold text-sidebar-foreground">{profile.currentStreak}</span>
          <span className="text-[9px] text-muted-foreground">streak</span>
        </div>
        <div className="flex flex-col items-center rounded-lg bg-background/50 py-1.5 px-1">
          <TimerIcon className="h-3 w-3 text-green-500 mb-0.5" />
          <span className="text-xs font-bold text-sidebar-foreground">{hours > 0 ? `${hours}h` : ""}{mins}m</span>
          <span className="text-[9px] text-muted-foreground">focus</span>
        </div>
        <div className="flex flex-col items-center rounded-lg bg-background/50 py-1.5 px-1">
          <ZapIcon className="h-3 w-3 text-yellow-500 mb-0.5" />
          <span className="text-xs font-bold text-sidebar-foreground">{profile.xp}</span>
          <span className="text-[9px] text-muted-foreground">xp</span>
        </div>
      </div>
    </div>
  );
}
