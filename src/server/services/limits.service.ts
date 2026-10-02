import { getUsage, getLimitSnapshots, todayKey } from "@/server/lib/usage-counter";
import { OPENROUTER_KEYS, OPENROUTER_SERVICES } from "@/server/lib/openrouter-keys";
import { GEMINI_KEYS, GEMINI_SERVICES } from "@/server/lib/gemini-keys";
import { GROQ_KEYS, GROQ_SERVICES } from "@/server/lib/groq-keys";
import { BYTEZ_KEYS, BYTEZ_SERVICES } from "@/server/lib/bytez-keys";

export type LimitsService = "openrouter" | "gemini" | "groq" | "bytez" | "qstash" | "b2_upload" | "b2_download";

export type LimitsStat = {
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

type Cap = { name: string; description: string; limit: number; unit: "requests" | "transactions" };

/** OpenRouter free-model cap per key (~50 req/day). Combined across all keys. */
const OPENROUTER_DEFAULT_LIMIT_PER_KEY = 50;
/** Groq free-tier cap per key (RPM-bounded, ~14,400 req/day). */
const GROQ_DEFAULT_LIMIT_PER_KEY = 14_400;
/** Bytez free-tier monthly credits converted to a conservative request cap. */
const BYTEZ_DEFAULT_LIMIT_PER_KEY = 1_000;

/** Request/day caps for each external service (free tier unless noted). */
const CAPS: Record<LimitsService, Cap> = {
  openrouter: {
    name: "OpenRouter (All Keys)",
    description: "AI extraction — combined across every configured key",
    limit: OPENROUTER_DEFAULT_LIMIT_PER_KEY,
    unit: "requests",
  },
  gemini: { name: "Gemini Flash (All Keys)", description: "AI extraction — combined across every configured key", limit: 1500, unit: "requests" },
  groq: { name: "Groq (All Keys)", description: "Text-only AI — combined across every configured key", limit: GROQ_DEFAULT_LIMIT_PER_KEY, unit: "requests" },
  bytez: { name: "Bytez (All Keys)", description: "Unified model API — combined across every configured key", limit: BYTEZ_DEFAULT_LIMIT_PER_KEY, unit: "requests" },
  qstash: { name: "QStash Messages", description: "Scheduled class reminders + push delivery", limit: 10000, unit: "transactions" },
  b2_upload: { name: "B2 Uploads (Class C)", description: "Image uploads to Backblaze", limit: 2500, unit: "transactions" },
  b2_download: { name: "B2 Downloads (Class B)", description: "Image downloads / previews", limit: 2500, unit: "transactions" },
};

/** Backblaze free tier: 1 GB/day download bandwidth. */
const B2_BANDWIDTH_LIMIT_BYTES = 1_000_000_000;

/** Real-time per-key usage/limit from OpenRouter's key endpoint. */
async function fetchOpenRouterInfo(
  apiKey: string,
): Promise<LimitsStat["realtime"] | undefined> {
  if (!apiKey) return undefined;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      data?: {
        label?: string;
        usage_daily?: number;
        limit?: number | null;
        limit_reset?: string | null;
        limit_remaining?: number | null;
        is_free_tier?: boolean;
      };
    };
    const d = json.data;
    if (!d) return undefined;
    return {
      usage: d.usage_daily ?? 0,
      limit: d.limit ?? null,
      reset: d.limit_reset ?? null,
      remaining: d.limit_remaining ?? null,
      isFreeTier: d.is_free_tier ?? true,
      label: d.label ?? "",
    };
  } catch {
    return undefined;
  }
}

function colorFor(usage: number, limit: number): LimitsStat["color"] {
  const pct = limit > 0 ? usage / limit : 1;
  if (pct >= 0.9) return "critical";
  if (pct >= 0.7) return "warn";
  return "ok";
}

export async function getLimitsStats() {
  const usage = await getUsage(todayKey());
  const byService = new Map(usage.map((u) => [u.service, u]));

  const [orInfo, snapshots] = await Promise.all([
    Promise.all(OPENROUTER_KEYS.map((key) => fetchOpenRouterInfo(key))),
    getLimitSnapshots(),
  ]);

  // Per-key real-time usage, preferring the provider x-ratelimit snapshot
  // (authoritative — it also reflects failed attempts, which consume the daily
  // cap), then the /key endpoint, then the local request counter.
  //
  // A snapshot is only authoritative while its window is still open. Once
  // `x-ratelimit-reset` passes, the provider's counter has rolled over, so the
  // stale 100/100 would stay red forever (no new call succeeds to refresh the
  // headers). Expired snapshots fall back to the live /key endpoint, or to the
  // fresh-window state (usage 0) so the card clears in real time after reset.
  const perKey = OPENROUTER_SERVICES.map((service, i) => {
    const snap = snapshots[service];
    const info = orInfo[i];
    const counted = byService.get(service)?.count ?? 0;
    const snapStale = snap?.resetAt != null && snap.resetAt.getTime() <= Date.now();
    const snapOk = snap != null && !snapStale;

    const limit =
      snapOk && snap.limit != null
        ? snap.limit
        : info?.limit && info.limit > 0
          ? info.limit
          : OPENROUTER_DEFAULT_LIMIT_PER_KEY;

    let usage: number;
    let remaining: number | null;
    let reset: string | null;

    if (snapOk && snap.remaining != null) {
      usage = Math.max(0, limit - snap.remaining);
      remaining = snap.remaining;
      reset = snap.resetAt ? snap.resetAt.toISOString() : (info?.reset ?? null);
    } else if (snapStale) {
      // The provider's daily window already rolled over → fresh budget. The
      // /key endpoint reports CREDITS (not requests), so it can't size the
      // daily request cap — showing the fresh window is the honest state.
      usage = 0;
      remaining = limit;
      reset = null;
    } else {
      // No snapshot yet → the local request counter is the best estimate.
      usage = Math.min(limit, counted);
      remaining = Math.max(0, limit - usage);
      reset = info?.reset ?? null;
    }

    return {
      usage,
      limit,
      remaining,
      reset,
      isFreeTier: info?.isFreeTier ?? true,
      label: info?.label ?? `Key ${i + 1}`,
    };
  });

  const orUsage = perKey.reduce((sum, k) => sum + k.usage, 0);
  const orLimit = perKey.reduce((sum, k) => sum + k.limit, 0);
  const knownRemaining = perKey.filter((k) => k.remaining != null);
  const orRemaining =
    knownRemaining.length === 0 ? null : knownRemaining.reduce((sum, k) => sum + (k.remaining ?? 0), 0);
  const orReset =
    perKey
      .map((k) => k.reset)
      .filter((r): r is string => !!r)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  const orFree = perKey.every((k) => k.isFreeTier);
  const orLabel = perKey.map((k) => k.label).filter(Boolean).join(", ");

  const stats: LimitsStat[] = (Object.entries(CAPS) as [LimitsService, Cap][])
    .filter(([id]) => id !== "openrouter" && id !== "gemini" && id !== "groq" && id !== "bytez")
    .map(([id, cap]) => {
      const row = byService.get(id);
      const count = row?.count ?? 0;
      return {
        id,
        name: cap.name,
        description: cap.description,
        usage: count,
        limit: cap.limit,
        unit: cap.unit,
        color: colorFor(count, cap.limit),
      };
    });

  if (perKey.length > 0) {
    stats.unshift({
      id: "openrouter",
      name: CAPS.openrouter.name,
      description: `${CAPS.openrouter.description} (${perKey.length} key${perKey.length === 1 ? "" : "s"})`,
      usage: orUsage,
      limit: orLimit,
      unit: "requests",
      color: colorFor(orUsage, orLimit),
      realtime: {
        usage: orUsage,
        limit: orLimit,
        reset: orReset,
        remaining: orRemaining,
        isFreeTier: orFree,
        label: orLabel,
      },
    });
  }

  // Gemini (All Keys): combined request count across every configured key.
  if (GEMINI_KEYS.length > 0) {
    const geminiUsage = GEMINI_SERVICES.reduce((sum, svc) => sum + (byService.get(svc)?.count ?? 0), 0);
    const geminiLimit = CAPS.gemini.limit * GEMINI_KEYS.length;
    stats.unshift({
      id: "gemini",
      name: CAPS.gemini.name,
      description: `${CAPS.gemini.description} (${GEMINI_KEYS.length} key${GEMINI_KEYS.length === 1 ? "" : "s"})`,
      usage: geminiUsage,
      limit: geminiLimit,
      unit: "requests",
      color: colorFor(geminiUsage, geminiLimit),
    });
  }

  // Groq (All Keys): combined request count.
  if (GROQ_KEYS.length > 0) {
    const groqUsage = GROQ_SERVICES.reduce((sum, svc) => sum + (byService.get(svc)?.count ?? 0), 0);
    const groqLimit = CAPS.groq.limit * GROQ_KEYS.length;
    stats.unshift({
      id: "groq",
      name: CAPS.groq.name,
      description: `${CAPS.groq.description} (${GROQ_KEYS.length} key${GROQ_KEYS.length === 1 ? "" : "s"})`,
      usage: groqUsage,
      limit: groqLimit,
      unit: "requests",
      color: colorFor(groqUsage, groqLimit),
    });
  }

  // Bytez (All Keys): combined request count.
  if (BYTEZ_KEYS.length > 0) {
    const bytezUsage = BYTEZ_SERVICES.reduce((sum, svc) => sum + (byService.get(svc)?.count ?? 0), 0);
    const bytezLimit = CAPS.bytez.limit * BYTEZ_KEYS.length;
    stats.unshift({
      id: "bytez",
      name: CAPS.bytez.name,
      description: `${CAPS.bytez.description} (${BYTEZ_KEYS.length} key${BYTEZ_KEYS.length === 1 ? "" : "s"})`,
      usage: bytezUsage,
      limit: bytezLimit,
      unit: "requests",
      color: colorFor(bytezUsage, bytezLimit),
    });
  }

  // B2 download bandwidth (1 GB/day free tier).
  const b2DownBytes = byService.get("b2_download")?.bytes ?? 0;
  stats.push({
    id: "b2_bandwidth",
    name: "B2 Download Bandwidth",
    description: "1 GB/day free download bandwidth",
    usage: b2DownBytes,
    limit: B2_BANDWIDTH_LIMIT_BYTES,
    bytesUsed: b2DownBytes,
    bytesLimit: B2_BANDWIDTH_LIMIT_BYTES,
    unit: "bandwidth",
    color: colorFor(b2DownBytes, B2_BANDWIDTH_LIMIT_BYTES),
  });

  return { stats, date: todayKey() };
}
