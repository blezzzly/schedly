"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/hooks/use-auth";
import { getUserSchedules } from "@/app/(dashboard)/classes/actions";
import {
  getWeatherByCoords,
  getWeatherByIp,
  type WeatherData,
} from "@/app/(dashboard)/dashboard/weather-actions";
import { retry } from "@/lib/retry";
import { withOfflineCache, cacheRead } from "@/lib/offline-cache";
import { QUEUE_FLUSHED_EVENT } from "@/lib/offline-queue";
import { LOCAL_WRITE_EVENT } from "@/lib/offline-writes";
import { cachedAction } from "@/lib/server-action-cache";
import { useMounted } from "@/lib/use-mounted";
import {
  getFreeTimeToday,
  DAY_ORDER,
  type InsightItem,
  type FreePeriod,
} from "@/features/insights/compute-insights";
import { toMin } from "@/features/dashboard/lib/class-time";
import type { ScheduleData } from "@/features/dashboard/lib/types";
import {
  BentoGrid,
  DashboardHeader,
  FreeTimeCard,
  ScheduleSection,
  TodayClassesCard,
  WeatherCard,
} from "@/features/dashboard/components";
import { UpdateAnnouncement } from "@/components/update-announcement";
import { AppNavPanel } from "@/components/app-nav-panel";

export default function DashboardPage() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<ScheduleData[] | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const scheduleRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  // Tick every second so countdowns visibly move.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Time-based greeting must be computed after mount — Date.now() differs
  // between the server and the client, which would break hydration.
  const mounted = useMounted();
  const greeting = !mounted
    ? ""
    : (() => {
        const h = new Date().getHours();
        return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
      })();

  const u = user as
    | { username?: string; firstName?: string; name?: string; isAnonymous?: boolean; image?: string; avatarUrl?: string }
    | null
    | undefined;
  // Guests get a short `guestNNN` handle as their username (it's what the /u/
  // profile route needs), but the name they actually picked at sign-in lives in
  // `name`. Greet them with the name they chose — "Good morning, guest851"
  // reads like a database row, "Good morning, Andres" reads like a person.
  const username = (u?.isAnonymous ? u?.name : u?.username) || u?.firstName || u?.name || "there";

  // Read the timetable, preferring the server and falling back to this device's
  // copy. Shared by the mount fetch and the offline-write listener below so both
  // resolve the same data the same way.
  const loadSchedules = useCallback(async () => {
    return withOfflineCache("schedule:list", () =>
      cachedAction("dash:schedules", () => getUserSchedules())
    );
  }, []);

  useEffect(() => {
    retry(loadSchedules, { delayMs: 2000 })
      .then((data) => setSchedules(data as ScheduleData[]))
      .catch(() => setSchedules([]));
  }, [loadSchedules]);

  // Refetch after an in-place edit so the timetable + today cards update.
  const reloadSchedules = useCallback(async () => {
    try {
      const data = await getUserSchedules();
      setSchedules(data as ScheduleData[]);
    } catch {
      // Keep the current state when the refresh fails.
    }
  }, []);

  // A schedule created offline is rendered from the local cache and marked as
  // waiting to sync. Once the queue replays it, the server holds the real row,
  // so the placeholder has to be replaced — otherwise the timetable keeps
  // showing a copy that no longer exists anywhere it counts.
  useEffect(() => {
    const onFlushed = () => {
      void reloadSchedules();
    };
    window.addEventListener(QUEUE_FLUSHED_EVENT, onFlushed);
    return () => window.removeEventListener(QUEUE_FLUSHED_EVENT, onFlushed);
  }, [reloadSchedules]);

  // A schedule created offline while the dashboard is already open. The save
  // path navigates to /dashboard, but going to the page you are already on
  // does not remount it, so without this the mount fetch above never runs again
  // and the schedule is saved but invisible.
  //
  // This reads the device cache directly rather than going back through
  // `loadSchedules`. That matters: `loadSchedules` runs `cachedAction`, which
  // holds a successful result for 15s, so within that window it would return the
  // list from *before* the save and `withOfflineCache` would write that stale
  // copy over the new one — silently undoing the schedule that was just
  // created. The cache is the authoritative copy at this moment.
  useEffect(() => {
    const onLocalWrite = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key;
      if (key !== "schedule:list") return;
      void cacheRead<ScheduleData[]>("schedule:list")
        .then((data) => {
          if (data) setSchedules(data);
        })
        .catch(() => {
          // Keep showing what is already there rather than blanking the page.
        });
    };
    window.addEventListener(LOCAL_WRITE_EVENT, onLocalWrite);
    return () => window.removeEventListener(LOCAL_WRITE_EVENT, onLocalWrite);
  }, []);

  // Fetch weather on mount using browser geolocation, falling back to IP-based
  // detection when permission is denied or unavailable. Results are cached so
  // the last known weather still shows offline.
  useEffect(() => {
    const fetchByIp = async () => {
      try {
        const res = await withOfflineCache(
          "weather:ip",
          () => getWeatherByIp(),
          { ttlMs: 60 * 60 * 1000 }
        );
        if (res.success) {
          setWeather(res.data);
        } else {
          setWeatherError(res.error);
        }
      } catch {
        setWeatherError("Failed to fetch weather");
      }
      setWeatherLoading(false);
    };

    if (!navigator.geolocation) {
      fetchByIp();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await withOfflineCache(
            `weather:coords:${pos.coords.latitude.toFixed(2)},${pos.coords.longitude.toFixed(2)}`,
            () => getWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
            { ttlMs: 60 * 60 * 1000 }
          );
          if (res.success) {
            setWeather(res.data);
          } else {
            setWeatherError(res.error);
          }
        } catch {
          setWeatherError("Failed to fetch weather");
        }
        setWeatherLoading(false);
      },
      fetchByIp,
      { enableHighAccuracy: false, timeout: 2000, maximumAge: 300000 }
    );
  }, []);

  const refreshWeather = useCallback(() => {
    const fetchByIp = async () => {
      try {
        const res = await withOfflineCache(
          "weather:ip",
          () => getWeatherByIp(),
          { ttlMs: 60 * 60 * 1000 }
        );
        if (res.success) {
          setWeather(res.data);
        } else {
          setWeatherError(res.error);
        }
      } catch {
        setWeatherError("Failed to fetch weather");
      }
      setWeatherLoading(false);
    };

    if (!navigator.geolocation) {
      setWeatherLoading(true);
      setWeatherError(null);
      fetchByIp();
      return;
    }
    setWeatherLoading(true);
    setWeatherError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await withOfflineCache(
            `weather:coords:${pos.coords.latitude.toFixed(2)},${pos.coords.longitude.toFixed(2)}`,
            () => getWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
            { ttlMs: 60 * 60 * 1000 }
          );
          if (res.success) {
            setWeather(res.data);
          } else {
            setWeatherError(res.error);
          }
        } catch {
          setWeatherError("Failed to fetch weather");
        }
        setWeatherLoading(false);
      },
      fetchByIp,
      { enableHighAccuracy: false, timeout: 2000, maximumAge: 300000 }
    );
  }, []);

  // If the user has several schedules, the big timetable below shows them one
  // at a time via left/right arrows. `idx` is the state, clamped to bounds so
  // it can never point past the list (e.g. after a schedule is deleted). It's
  // persisted so the selected schedule survives switching tabs.
  const [activeIndex, setActiveIndex] = useState(() => {
    if (typeof window === "undefined") return 0;
    const raw = window.localStorage.getItem("schedly-active-schedule-idx");
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  const scheduleCount = schedules?.length ?? 0;
  const idx = Math.min(activeIndex, Math.max(0, scheduleCount - 1));
  const activeSchedule = scheduleCount > 0 && schedules ? schedules[idx] ?? null : null;
  const activeClasses = activeSchedule?.classes ?? [];

  useEffect(() => {
    window.localStorage.setItem("schedly-active-schedule-idx", String(idx));
  }, [idx]);

  // Schedule insights are derived purely from class times (client-side, offline).
  // Only the currently selected schedule feeds the dashboard cards.
  const insightItems: InsightItem[] = activeClasses.map((c) => ({
    subject: c.shortName?.trim() || c.code?.trim() || c.subject,
    days: c.days,
    startMinutes: toMin(c.startTime),
    endMinutes: toMin(c.endTime),
  }));
  const todayDay = DAY_ORDER[(new Date().getDay() + 6) % 7] ?? "monday";
  const freeToday = getFreeTimeToday(insightItems, todayDay);

  const todaysClasses = activeClasses
    .filter((c) => c.days.includes(todayDay))
    .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));

  // The next class on a day after today (e.g. tomorrow's earliest subject),
  // shown compactly inside the Today's Classes card without expanding it.
  const nextDayClass = (() => {
    if (schedules === null) return null;
    const startDayIdx = new Date().getDay();
    for (let offset = 1; offset <= 7; offset++) {
      const day = DAY_ORDER[(startDayIdx + 6 + offset) % 7] ?? "monday";
      const dayClasses = activeClasses
        .filter((c) => c.days.includes(day))
        .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
      if (dayClasses.length > 0) return { day, cls: dayClasses[0]! };
    }
    return null;
  })();

  // The longest free window today — the practical answer to "when can I study / rest?"
  const longestBreakToday = freeToday.freePeriods.reduce<FreePeriod | null>(
    (best, p) => (best === null || p.durationMinutes > best.durationMinutes ? p : best),
    null
  );

  const handleDownload = async () => {
    // Download exactly what the user sees: capture the visible timetable
    // (scheduleRef) first, and only fall back to the off-screen export render.
    const node = scheduleRef.current || captureRef.current;
    if (!node) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(node, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: node.scrollWidth,
        windowHeight: node.scrollHeight,
      });

      // A white frame around the timetable makes the image a bit wider and
      // taller, and gives the rounded corners room so no class cell is ever
      // clipped — the grid keeps its full shape on every side.
      const padX = 36;
      const padY = 56;
      const radius = 24;
      const rounded = document.createElement("canvas");
      rounded.width = canvas.width + padX * 2;
      rounded.height = canvas.height + padY * 2;
      const rctx = rounded.getContext("2d")!;
      rctx.fillStyle = "#ffffff";
      rctx.fillRect(0, 0, rounded.width, rounded.height);
      rctx.beginPath();
      rctx.moveTo(radius, 0);
      rctx.arcTo(rounded.width, 0, rounded.width, rounded.height, radius);
      rctx.arcTo(rounded.width, rounded.height, 0, rounded.height, radius);
      rctx.arcTo(0, rounded.height, 0, 0, radius);
      rctx.arcTo(0, 0, rounded.width, 0, radius);
      rctx.closePath();
      rctx.clip();
      rctx.drawImage(canvas, padX, padY);

      const dataUrl = rounded.toDataURL("image/png");

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "schedule.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download failed", err);
      alert("Failed to download image. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pt-4 md:pt-0 md:space-y-8">
      <UpdateAnnouncement />
      <DashboardHeader greeting={greeting} username={username} />

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <AppNavPanel />

        <div className="min-w-0 flex-1 space-y-4 md:space-y-8">
          <BentoGrid>
            <TodayClassesCard
              classes={todaysClasses}
              now={now}
              loading={schedules === null}
              nextDay={nextDayClass}
            />
            <WeatherCard
              weather={weather}
              loading={weatherLoading}
              error={weatherError}
              onRefresh={refreshWeather}
            />
            <FreeTimeCard
              loading={schedules === null}
              freeToday={freeToday}
              longestBreak={longestBreakToday}
            />
          </BentoGrid>

          <ScheduleSection
            schedules={schedules}
            activeClasses={activeClasses}
            activeSchedule={activeSchedule}
            scheduleCount={scheduleCount}
            idx={idx}
            setActiveIndex={setActiveIndex}
            downloading={downloading}
            onDownload={handleDownload}
            onEdited={reloadSchedules}
            onRefresh={reloadSchedules}
            scheduleRef={scheduleRef}
            captureRef={captureRef}
          />
        </div>
      </div>
    </div>
  );
}