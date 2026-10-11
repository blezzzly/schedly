"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Check, Download, HardDrive, Loader2, Trash2, Wifi } from "lucide-react";
import {
  getConnectionInfo,
  getLowDataSnapshot,
  isLowDataEnabled,
  setLowDataEnabled,
  subscribeLowData,
} from "@/lib/low-data";
import {
  clearOfflineCache,
  prepareForOffline,
  type PrepareStep,
} from "@/lib/offline-readiness";
import { getStorageInfo, type StorageInfo } from "@/lib/offline-cache";
import {
  getOfflineStatus,
  subscribeOfflineStatus,
  summarizeStatus,
} from "@/lib/offline-status";
import { listPendingWrites, flushOfflineWrites } from "@/lib/offline-queue";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { clearAccountData } from "@/lib/offline-cache";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Offline and data settings.
 *
 * Two controls that belong together because they answer the same question from
 * opposite ends — "how much of this app can I trust with no connection" and
 * "how much of my data is it allowed to spend".
 *
 * Both report what actually happened rather than what was intended. The
 * readiness card in particular will say "3 screens could not be saved" instead
 * of a green tick, because the failure this app must not have is claiming to be
 * offline-ready over a half-empty cache.
 */
export function OfflineDataTab() {
  const { user } = useAuth();
  const enabled = useSyncExternalStore(subscribeLowData, getLowDataSnapshot, () => false);
  const status = useSyncExternalStore(subscribeOfflineStatus, getOfflineStatus, getOfflineStatus);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [steps, setSteps] = useState<PrepareStep[] | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const connection = getConnectionInfo();
  const summary = summarizeStatus(status);

  // Assigned from the async continuation rather than in the effect body, which
  // would setState synchronously on every mount and cascade a re-render.
  useEffect(() => {
    let active = true;
    Promise.all([getStorageInfo(), listPendingWrites()]).then(([info, rows]) => {
      if (!active) return;
      setStorage(info);
      setPendingCount(rows.length);
    });
    return () => {
      active = false;
    };
  }, [status.revision]);

  const refresh = useCallback(async () => {
    const [info, rows] = await Promise.all([getStorageInfo(), listPendingWrites()]);
    setStorage(info);
    setPendingCount(rows.length);
  }, []);

  const runPrepare = useCallback(
    async (force = false) => {
      setWorking(true);
      setMessage(null);
      try {
        const result = await prepareForOffline({
          force,
          onProgress: (s) => setSteps(s),
        });
        if (result.alreadyPrepared) {
          setMessage("Already saved for offline use. Nothing to download.");
        } else if (result.ok) {
          setMessage("Schedly is saved on this device and will open without a connection.");
        } else if (result.error) {
          setMessage(result.error);
        } else {
          setMessage(
            `${result.incomplete.length} screen${result.incomplete.length === 1 ? "" : "s"} could not be saved. Try again on a better connection.`
          );
        }
      } finally {
        setWorking(false);
        setSteps(null);
        await refresh();
      }
    },
    [refresh]
  );

  const eraseEverything = async () => {
    const accountId = (user as { id?: string } | null)?.id;
    if (!accountId) return;
    if (
      !confirm(
        "Erase everything Schedly has stored on this device?\n\n" +
          "Your schedules, notes and anything waiting to sync will be removed from this device. " +
          "Anything already on the server is not affected."
      )
    ) {
      return;
    }
    setWorking(true);
    try {
      await clearAccountData(accountId);
      await clearOfflineCache();
      setMessage("Offline data erased from this device.");
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  const prepared = status.prepared;
  const storageLabel = formatStorage(storage);

  return (
    <div className="space-y-3">
      {/* --- Offline readiness ------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            Offline use
          </CardTitle>
          <CardDescription>
            Schedly needs to download itself once before it can open with no
            connection. Everything after that works offline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ReadinessRow
            prepared={prepared}
            pendingCount={pendingCount}
            incompleteCount={status.incomplete.length}
            preparedAt={status.preparedAt}
          />

          {steps ? (
            <ol className="space-y-1.5" aria-live="polite">
              {steps.map((step) => (
                <li key={step.id} className="flex items-center gap-2.5 text-sm">
                  <StepIcon status={step.status} />
                  <span
                    className={cn(
                      step.status === "done"
                        ? "text-muted-foreground"
                        : step.status === "failed"
                          ? "text-destructive"
                          : "text-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                  {step.detail ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {step.detail}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}

          {message ? (
            <p
              className="rounded-2xl border border-border/60 bg-muted/40 p-3 text-sm text-foreground"
              role="status"
            >
              {message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => runPrepare(prepared === true)}
              disabled={working}
              className="flex-1 sm:flex-none"
            >
              {working ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : prepared === true ? (
                "Check again"
              ) : (
                "Prepare for offline use"
              )}
            </Button>
            {pendingCount > 0 ? (
              <Button
                variant="outline"
                onClick={async () => {
                  setWorking(true);
                  try {
                    const result = await flushOfflineWrites({ force: true });
                    setMessage(
                      result.sent > 0
                        ? `Sent ${result.sent} change${result.sent === 1 ? "" : "s"}.`
                        : "Could not reach the server. Your changes are safe here."
                    );
                  } finally {
                    setWorking(false);
                    await refresh();
                  }
                }}
                disabled={working || status.connection === "offline"}
              >
                Sync now
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* --- Low Data Mode ----------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" />
            Low Data Mode
          </CardTitle>
          <CardDescription>
            Stops the app refreshing on its own, so it only uses data when you
            open a screen or pull to refresh. Nothing is hidden and nothing
            stops working.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-foreground">
                Use less data
              </span>
              <span className="block text-sm text-muted-foreground">
                {enabled
                  ? "On — no background refreshing, search waits for you to submit."
                  : "Off — the app refreshes in the background so screens are current."}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Low Data Mode"
              onClick={() => setLowDataEnabled(!enabled)}
              className={cn(
                "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
                enabled ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
                  enabled ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
          </label>

          {connection.saveData ? (
            <p className="flex items-start gap-2 rounded-2xl border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Your browser already asks sites to save data, so Schedly is being
              careful with it regardless of this switch.
            </p>
          ) : null}

          <p className="text-xs leading-relaxed text-muted-foreground">
            Schedly does not provide free mobile data or bypass carrier billing.
            Any zero-rated or sponsored offer comes from your network operator,
            not from this app.
          </p>
        </CardContent>
      </Card>

      {/* --- Storage ----------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" />
            Storage on this device
          </CardTitle>
          <CardDescription>
            {summary?.detail ??
              "Saved schedules, notes and anything waiting to sync."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Used</dt>
              <dd className="font-medium text-foreground">{storageLabel.used}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Available</dt>
              <dd className="font-medium text-foreground">
                {storageLabel.total}
              </dd>
            </div>
          </dl>

          {storage && !storage.persisted && storage.canPersist ? (
            <p className="rounded-2xl border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
              Your browser may clear offline data if this device runs short of
              space. Using &ldquo;Prepare for offline use&rdquo; asks it to keep
              this data instead.
            </p>
          ) : storage?.persisted ? (
            <p className="flex items-start gap-2 rounded-2xl border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              This device is set to keep Schedly&rsquo;s offline data.
            </p>
          ) : null}

          <Button
            variant="outline"
            onClick={eraseEverything}
            disabled={working}
            className="w-full text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Erase offline data on this device
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Removes everything stored here, including anything still waiting to
            sync. Anything already on the server stays. Signing out does not do
            this — your unsynced work is kept, just closed off so nobody else can
            see it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ReadinessRow({
  prepared,
  pendingCount,
  incompleteCount,
  preparedAt,
}: {
  prepared: boolean | null;
  pendingCount: number;
  incompleteCount: number;
  preparedAt: number | null;
}) {
  // Three distinct states, not two. "We have not checked yet" must not read as
  // "this is broken", or a freshly-installed app looks faulty for no reason.
  const { tone, label, detail } =
    prepared === null
      ? {
          tone: "muted" as const,
          label: "Checking…",
          detail: "Working out what this device has saved.",
        }
      : prepared
        ? {
            tone: "ok" as const,
            label: "Ready for offline use",
            detail: preparedAt
              ? `Saved ${new Date(preparedAt).toLocaleDateString()}. Schedly will open with no connection.`
              : "Schedly will open with no connection.",
          }
        : {
            tone: "warn" as const,
            label: "Not fully saved yet",
            detail: incompleteCount
              ? `${incompleteCount} screen${incompleteCount === 1 ? "" : "s"} could not be saved.`
              : "Schedly has not finished saving itself on this device.",
          };

  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        tone === "ok"
          ? "border-emerald-500/40 bg-emerald-500/10"
          : tone === "warn"
            ? "border-amber-500/40 bg-amber-500/10"
            : "border-border/60 bg-muted/40"
      )}
    >
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      {pendingCount > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {pendingCount} change{pendingCount === 1 ? "" : "s"} on this device
          {prepared ? " still waiting to sync." : " will be kept until you are back online."}
        </p>
      ) : null}
    </div>
  );
}

function StepIcon({ status }: { status: PrepareStep["status"] }) {
  if (status === "running") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />;
  }
  if (status === "done") {
    return <Check className="h-4 w-4 shrink-0 text-emerald-600" />;
  }
  if (status === "failed") {
    return <span className="h-4 w-4 shrink-0 text-center text-destructive">!</span>;
  }
  if (status === "skipped") {
    return <span className="h-4 w-4 shrink-0 text-center text-muted-foreground">–</span>;
  }
  return <span className="h-4 w-4 shrink-0 rounded-full border border-border" />;
}

function formatStorage(info: StorageInfo | null): { used: string; total: string } {
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (!info) return { used: "—", total: "—" };
  return {
    used: info.usage === null ? "Not reported" : mb(info.usage),
    total: info.quota === null ? "Not reported" : mb(info.quota),
  };
}

export { isLowDataEnabled };
