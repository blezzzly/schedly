"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { getLimitsStatsAction } from "../actions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HeaderBack } from "@/components/header-back";
import { Activity, Gauge, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type LimitsStat = {
  id: string;
  name: string;
  description: string;
  usage: number;
  limit: number;
  bytesUsed?: number;
  bytesLimit?: number;
  unit: "requests" | "transactions" | "bandwidth";
  color: "ok" | "warn" | "critical";
  realtime?: {
    usage: number;
    limit: number | null;
    reset: string | null;
    remaining: number | null;
    isFreeTier: boolean;
    label: string;
  };
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1_024) return `${(n / 1_024).toFixed(1)} KB`;
  return `${n} B`;
}

function StatBar({ stat }: { stat: LimitsStat }) {
  const isBandwidth = stat.unit === "bandwidth";
  const usage = isBandwidth ? stat.bytesUsed ?? stat.usage : stat.usage;
  const limit = isBandwidth ? stat.bytesLimit ?? stat.limit : stat.limit;
  const pct = limit > 0 ? Math.min(100, (usage / limit) * 100) : 100;

  const colors = {
    ok: "bg-emerald-500",
    warn: "bg-amber-500",
    critical: "bg-red-500",
  } as const;

  const badge = {
    ok: {
      text: "OK",
      icon: CheckCircle,
      cls: "bg-emerald-500/10 text-emerald-600",
    },
    warn: {
      text: "70%+",
      icon: Gauge,
      cls: "bg-amber-500/10 text-amber-600",
    },
    critical: {
      text: "90%+",
      icon: AlertTriangle,
      cls: "bg-red-500/10 text-red-600",
    },
  } as const;

  const b = badge[stat.color];
  const usageLabel = isBandwidth ? formatBytes(usage) : formatNumber(usage);
  const limitLabel = isBandwidth ? formatBytes(limit) : formatNumber(limit);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{stat.name}</h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                b.cls
              )}
            >
              <b.icon className="h-3 w-3" />
              {b.text}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{stat.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-foreground">
            {usageLabel}
            <span className="text-muted-foreground"> / {limitLabel}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">{pct.toFixed(1)}%</div>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", colors[stat.color])}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      {stat.realtime && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {stat.realtime.isFreeTier && (
            <span>Free tier — ~50 req/day per key</span>
          )}
          {stat.realtime.limit != null && (
            <span>
              Provider: {formatNumber(stat.realtime.usage)}/
              {formatNumber(stat.realtime.limit)}
              {stat.realtime.reset
                ? ` · resets ${new Date(stat.realtime.reset).toLocaleTimeString()}`
                : ""}
              {stat.realtime.remaining === 0 && (
                <span className="font-semibold text-red-600"> · EXHAUSTED</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminLimitsPage() {
  const { user } = useAuth();
  const isAdmin = Boolean((user as Record<string, unknown> | null)?.isAdmin);
  const [stats, setStats] = useState<LimitsStat[] | null>(null);
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(
    async (background = false) => {
      if (!isAdmin) return;
      if (!background) setRefreshing(true);
      try {
        const res = await getLimitsStatsAction();
        setStats(res.stats);
        setDate(res.date);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load limits");
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [isAdmin],
  );

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      try {
        const res = await getLimitsStatsAction();
        if (cancelled) return;
        setStats(res.stats);
        setDate(res.date);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load limits");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const interval = setInterval(() => void load(true), 300_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center text-sm text-muted-foreground">
        Admin access required.
      </div>
    );
  }

  // `p-6` on all four sides doubled up with the layout's own `md:px-8` and its
  // `md:pt-6`, and there was no `md:pt-0`, so a dense monitoring screen opened
  // with ~50px of dead space above the fold. Widened too: these are numbers to
  // compare against each other, not a form to fill in.
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-4 pb-24 sm:px-6 md:px-0 md:pt-0 md:pb-12">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <HeaderBack to="/admin" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Service Limits</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Daily usage caps for {date || "today"} — auto-refreshes every 30s · resets at midnight.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(false)}
              disabled={refreshing}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
            )}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            LIVE
          </span>
          {lastUpdated && <span>Last updated {lastUpdated}</span>}
          <span className="tabular-nums">
            · now {now.toLocaleTimeString()}
          </span>
          {!loading && stats && (
            <span className="hidden sm:inline">
              · {stats.filter((s) => s.realtime?.remaining === 0).length} cap(s) exhausted
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && stats && (
        <div className="grid gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-primary" />
                Today&apos;s Usage
              </CardTitle>
              <CardDescription className="text-xs">
                {date} · resets at midnight
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {stats.map((stat) => (
                <StatBar key={stat.id} stat={stat} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {!loading && !stats && !error && (
        <p className="text-sm text-muted-foreground">No data available yet.</p>
      )}

      <div className="rounded-xl border border-border/60 bg-muted/40 p-4 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">Tips</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>
            The OpenRouter card aggregates every configured key — it reads the provider&apos;s live
            rate-limit headers and sums them, so the numbers update on every AI call, even failed ones.
          </li>
          <li>
            Once a key&apos;s reset time passes, the card automatically clears to a fresh window —
            it never stays stuck at 100% after the provider resets.
          </li>
          <li>Gemini, QStash, and B2 counts come from local request counters (updates as requests are made).</li>
          <li>B2 free tier: 1 GB/day download bandwidth + 2,500 Class B &amp; C transactions/day.</li>
          <li>When a cap is at 90%+ it turns red — consider slowing down or adding a payment method.</li>
        </ul>
      </div>
    </div>
  );
}
