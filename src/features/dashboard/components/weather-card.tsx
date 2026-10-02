"use client";

import Image from "next/image";
import { Droplets, RefreshCw, Sun, Wind } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Skeleton as BoneSkeleton } from "boneyard-js/react";
import type { WeatherData } from "@/app/(dashboard)/dashboard/weather-actions";

type WeatherCardProps = {
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

// Dashboard side tile (right column on desktop, stacked on mobile). Rows
// wrap instead of clipping so the card keeps working at any width.
export function WeatherCard({ weather, loading, error, onRefresh }: WeatherCardProps) {
  return (
    <Card className="bento-tile-side">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Weather</CardTitle>
        <div className="flex items-center gap-2">
          {weather && (
            <button
              type="button"
              aria-label="Refresh weather"
              disabled={loading}
              onClick={onRefresh}
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {loading ? (
                <Spinner size={12} color="var(--muted-foreground)" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <Sun className="hidden h-4 w-4 text-primary sm:block" />
        </div>
      </CardHeader>
      <CardContent>
        <BoneSkeleton
          name="dashboard-weather"
          loading={loading}
          fallback={
            // Skeleton mirrors the real card's exact structure: temperature +
            // weather icon row, location line, then the humidity/wind row under
            // a divider — same margins so the height matches once data loads.
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-baseline gap-1">
                  <Skeleton className="h-8 w-12" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              </div>
              <Skeleton className="mt-1 h-4 w-24" />
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-14" />
              </div>
            </div>
          }
        >
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : weather ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-foreground">
                    {weather.temperature}°
                  </span>
                  <span className="truncate text-xs text-muted-foreground capitalize">
                    {weather.description}
                  </span>
                </div>
                <Image
                  src={weather.icon}
                  alt={weather.description}
                  width={40}
                  height={40}
                  className="h-10 w-10 shrink-0"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <p className="mt-1 truncate text-xs font-medium text-foreground">
                {weather.city}, {weather.country}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Droplets className="h-3 w-3 shrink-0" />
                  {weather.humidity}%
                </span>
                <span className="flex items-center gap-1">
                  <Wind className="h-3 w-3 shrink-0" />
                  {weather.windSpeed} km/h
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No weather data</p>
          )}
        </BoneSkeleton>
      </CardContent>
    </Card>
  );
}