"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  WifiOff,
  RefreshCw,
  CloudUpload,
  Check,
  AlertTriangle,
  HardDriveDownload,
  X,
} from "lucide-react";
import {
  getOfflineStatus,
  subscribeOfflineStatus,
  summarizeStatus,
} from "@/lib/offline-status";
import {
  flushOfflineWrites,
  listPendingWrites,
  dropPendingWrite,
  type PendingWrite,
} from "@/lib/offline-queue";
import { SYNC_LABEL } from "@/lib/offline-writes";

/**
 * The one place that says what the app's connection is doing.
 *
 * Replaces a banner that only knew about `navigator.onLine`, which is the
 * signal that is wrong most often: it reports a phone on a dead Wi-Fi network
 * as online, so the old banner stayed silent while every request failed.
 *
 * Two rules shape what is shown:
 *
 *  - Nothing at all when everything is fine. A permanent banner teaching users
 *    to ignore it is worse than no banner, so the healthy case renders null.
 *  - Never a spinner with no end. Offline is a state, not a failure to load,
 *    and the user is looking at real cached data while it lasts.
 *
 * Tapping opens the detail sheet, which is where the actual list of unsynced
 * work lives — a count on its own tells a user nothing about what is waiting or
 * whether it is safe to close the app.
 */

function useOfflineStatus() {
  return useSyncExternalStore(subscribeOfflineStatus, getOfflineStatus, getOfflineStatus);
}

export function ConnectionStatus() {
  const status = useOfflineStatus();
  const [open, setOpen] = useState(false);
  const summary = summarizeStatus(status);

  // A count that is wrong is worse than no count, so refresh it whenever the
  // status changes rather than only on mount.
  if (!summary) return null;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 md:hidden"
        style={{ bottom: "calc(6.5rem + var(--sab))" }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className={`pointer-events-auto flex max-w-full items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl ${
            toneClasses(summary.tone)
          }`}
        >
          <IconFor summary={summary} status={status} />
          <span className="truncate">{summary.label}</span>
        </button>
      </div>

      {/* Desktop has no bottom nav to sit above, and the user is not looking at
          the bottom of a wide screen, so it lives in the corner instead. */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 hidden md:block">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl ${toneClasses(
            summary.tone
          )}`}
        >
          <IconFor summary={summary} status={status} />
          <span className="truncate">{summary.label}</span>
        </button>
      </div>

      {open ? <StatusSheet status={status} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function IconFor({
  summary,
  status,
}: {
  summary: NonNullable<ReturnType<typeof summarizeStatus>>;
  status: ReturnType<typeof getOfflineStatus>;
}) {
  if (status.storageError) return <HardDriveDownload className="h-3.5 w-3.5 shrink-0" />;
  if (summary.tone === "error") return <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
  if (status.sync === "syncing") {
    return <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />;
  }
  if (status.connection === "offline") return <WifiOff className="h-3.5 w-3.5 shrink-0" />;
  return <CloudUpload className="h-3.5 w-3.5 shrink-0" />;
}

function toneClasses(tone: "ok" | "info" | "warn" | "error"): string {
  switch (tone) {
    case "error":
      return "border-destructive/40 bg-destructive/95 text-destructive-foreground";
    case "warn":
      return "border-amber-500/40 bg-amber-500/95 text-amber-950";
    default:
      return "border-border/60 bg-foreground/90 text-background";
  }
}

/* --- Detail sheet ---------------------------------------------------------- */

function StatusSheet({
  status,
  onClose,
}: {
  status: ReturnType<typeof getOfflineStatus>;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<PendingWrite[]>([]);
  const [busy, setBusy] = useState(false);
  const summary = summarizeStatus(status);

  // Read inside an effect and assigned from the async continuation, rather than
  // setting state in the effect body — the latter re-renders synchronously on
  // every mount, which is exactly the cascade the lint rule exists to prevent.
  useEffect(() => {
    let active = true;
    listPendingWrites().then((rows) => {
      if (active) setEntries(rows);
    });
    return () => {
      active = false;
    };
  }, [status.revision]);

  // Lock the page behind the sheet so the background does not scroll on iOS.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reload = async () => {
    setEntries(await listPendingWrites());
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      await flushOfflineWrites({ force: true });
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const discard = async (id: string) => {
    await dropPendingWrite(id);
    await reload();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sync status"
        className="relative w-full max-w-md rounded-t-3xl border-2 border-foreground/70 bg-card p-6 pb-[calc(1.25rem+var(--sab))] shadow-[4px_4px_0_0_#401f32]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              {summary?.label ?? "All synced"}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {summary?.detail ?? "Everything on this device is on the server."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {status.storageError ? (
          <p className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive">
            {status.storageError} Changes may not be able to be saved on this device.
          </p>
        ) : null}

        {entries.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {entry.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {entry.lastError
                      ? entry.lastError
                      : entry.attempts > 0
                        ? `Retrying — attempt ${entry.attempts + 1}`
                        : "Waiting for a connection"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => discard(entry.id)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {status.pending > 0 ? (
          <button
            type="button"
            onClick={syncNow}
            disabled={busy || status.connection === "offline"}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#EC4899] to-[#F472B6] text-[15px] font-semibold text-white shadow-[0_12px_30px_rgba(236,72,153,0.35)] transition active:scale-[0.97] disabled:opacity-60"
          >
            <RefreshCw className={`h-5 w-5 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Syncing…" : "Sync now"}
          </button>
        ) : (
          <div className="mt-6 flex items-center justify-center gap-2 rounded-full bg-muted/50 py-3 text-sm font-medium text-muted-foreground">
            <Check className="h-4 w-4" />
            Nothing waiting to sync
          </div>
        )}

        {status.lastSyncedAt ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Last synced {new Date(status.lastSyncedAt).toLocaleTimeString()}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export { SYNC_LABEL };
