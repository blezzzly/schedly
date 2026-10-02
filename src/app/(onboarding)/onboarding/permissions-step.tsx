"use client";

import { useEffect, useState } from "react";
import { Check, Info, MapPin, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import {
  isPushSupported,
  enablePush,
  isIosPwa,
} from "@/lib/push";
import { getPermissionState, updatePermissionState } from "./actions";
import { saveUploadState } from "@/features/upload/lib/upload-state";

const DEFAULT_TIMEZONE = "Asia/Manila";

type LocState = "loading" | "off" | "requesting" | "granted" | "denied" | "unsupported";

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function deniedLocMsg(): string {
  return isIosPwa()
    ? "Location is blocked. Enable it in iOS Settings → Schedly → Location."
    : "Location is blocked. Allow Schedly to access your location in your browser or device settings, then try again.";
}

async function geolocationPermission(): Promise<"granted" | "denied" | "prompt" | "unsupported"> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "unsupported";
  try {
    const p = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return p.state;
  } catch {
    return "prompt";
  }
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? "bg-primary" : "bg-muted"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span className="absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-primary shadow-sm transition-transform duration-200">
        {checked ? <Check className="h-3 w-3" /> : null}
      </span>
    </button>
  );
}

/** Step 1: Snap or upload a timetable photo. This is the only onboarding
 *  step the user is required to complete — there's no skip. As soon as the
 *  user picks a photo we kick off the upload + AI extraction in the
 *  background so the dashboard is ready to render when they land there. */
export function UploadScheduleCard({
  onComplete,
  finishing,
  buttonLabel,
  userId,
}: {
  onComplete: () => void;
  finishing: boolean;
  buttonLabel: string;
  userId: string;
}) {
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing" | "done">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPickedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setPhase("uploading");
    setUploadError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-csrf-protection": "1" },
        credentials: "include",
        body: fd,
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.status === 413) {
        throw new Error("The file is too large. Please choose a smaller image.");
      }
      if (res.status === 429) {
        throw new Error("Too many uploads. Please wait a moment and try again.");
      }
      if (!res.ok) {
        throw new Error("Upload failed. We'll try again from the dashboard.");
      }
      const data = (await res.json()) as { uploadId?: string; fileUrl?: string };
      if (data.uploadId) {
        // Persist the in-flight upload so the dashboard can resume polling it
        // when the user lands there from onboarding.
        saveUploadState(userId, {
          uploadId: data.uploadId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          previewUrl,
        });
      }
      setPhase("done");
    } catch (err) {
      setPhase("idle");
      setPickedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      const msg = err instanceof Error ? err.message : "Network error. We'll try again from the dashboard.";
      setUploadError(msg);
      toast.error(msg);
    }
  };

  const handleRetry = () => {
    if (!pickedFile) return;
    const file = pickedFile;
    setPickedFile(null);
    setPreviewUrl(null);
    setUploadError(null);
    setPhase("idle");
    queueMicrotask(() => {
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById("timetable-file-input") as HTMLInputElement | null;
      if (input) {
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  };

  const handleRemove = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPickedFile(null);
    setPreviewUrl(null);
    setUploadError(null);
    setPhase("idle");
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 transition-colors ${
        uploadError
          ? "border-destructive/40 bg-destructive/5"
          : phase === "processing"
            ? "border-primary/40 bg-primary/5"
            : "border-border/50"
      }`}>
        {previewUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Selected timetable preview"
              className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-border/40"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{pickedFile?.name}</p>
              <p className="text-xs text-muted-foreground">
                {phase === "uploading" && "Uploading…"}
                {phase === "processing" && "Reading your schedule in the background…"}
                {phase === "done" && "Saved. We'll finish reading in the background."}
                {phase === "idle" && pickedFile && uploadError
                  ? uploadError
                  : phase === "idle" && pickedFile
                    ? `${(pickedFile.size / 1024).toFixed(0)} KB`
                    : null}
              </p>
            </div>
            {(phase === "idle" || phase === "done") && (
              <button
                type="button"
                onClick={handleRemove}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Remove photo"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {(phase === "uploading" || phase === "processing") && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                <Spinner size={16} color="var(--primary)" />
              </span>
            )}
            {phase === "done" && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center text-primary">
                <Check className="h-5 w-5" />
              </span>
            )}
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Upload className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Upload your timetable</p>
              <p className="text-xs text-muted-foreground">
                Take a photo or pick from your gallery — JPG or PNG.
              </p>
            </div>
            <input
              id="timetable-file-input"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePick}
            />
          </label>
        )}
      </div>

      {uploadError && phase === "idle" && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex-1">
            <p>{uploadError}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-1 text-xs font-semibold text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      <Button
        className="mt-2 h-12 w-full font-semibold"
        disabled={finishing || !pickedFile || phase === "uploading" || phase === "processing"}
        onClick={onComplete}
      >
        {finishing ? "Finishing up..." : buttonLabel}
      </Button>
    </div>
  );
}

/** Step 2: location permission is optional, but the continue button is
 *  always enabled — the user is not allowed to "skip" beyond this point
 *  without completing the upload step first. */
export function PermissionsStep({
  onComplete,
  finishing,
  buttonLabel,
}: {
  onComplete: () => void;
  finishing: boolean;
  buttonLabel: string;
}) {
  const [loc, setLoc] = useState<LocState>("loading");
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

  useEffect(() => {
    let active = true;

    const t = setTimeout(() => {
      const tz = detectTimezone();
      setTimezone(tz);

      geolocationPermission().then((state) => {
        if (!active) return;
        if (state === "granted") {
          setLoc("granted");
          updatePermissionState({ locationEnabled: true, timezone: tz }).catch(() => {});
        } else if (state === "denied") {
          setLoc("denied");
          setLocMsg(deniedLocMsg());
        } else if (state === "unsupported") {
          setLoc("unsupported");
          setLocMsg("Location isn't supported on this browser.");
        } else {
          setLoc("off");
        }
      });

      getPermissionState()
        .then((s) => {
          if (!active) return;
          if (s?.timezone && s.timezone !== "UTC") setTimezone(s.timezone);
          if (isPushSupported() && Notification.permission === "granted") {
            enablePush().catch(() => {});
          }
        })
        .catch(() => {});
    }, 0);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, []);

  const handleLocation = () => {
    if (loc === "requesting" || loc === "granted") return;
    setLocMsg(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLoc("unsupported");
      setLocMsg("Location isn't supported on this browser.");
      return;
    }
    setLoc("requesting");
    navigator.geolocation.getCurrentPosition(
      () => {
        setLoc("granted");
        updatePermissionState({ locationEnabled: true, timezone }).catch(() => {});
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLoc("denied");
          setLocMsg(deniedLocMsg());
        } else {
          setLoc("off");
          setLocMsg("Couldn't get your location. Check your connection and try again.");
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  const permissionRow = (icon: React.ReactNode, title: string, description: string, extra: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/50 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {extra}
    </div>
  );

  return (
    <div className="space-y-4">
      {permissionRow(
        <MapPin className="h-5 w-5" />,
        "Allow location",
        "We’ll use your location to provide weather information for your schedule.",
        <Toggle
          checked={loc === "granted"}
          onChange={handleLocation}
          disabled={loc === "requesting" || loc === "unsupported"}
          label="Allow location"
        />
      )}
      {locMsg && (
        <p className="flex items-start gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {locMsg}
        </p>
      )}
      {loc === "requesting" ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner size={14} color="var(--muted-foreground)" />
          Waiting for permission…
        </div>
      ) : null}

      <Button
        className="mt-2 h-12 w-full font-semibold"
        disabled={finishing}
        onClick={onComplete}
      >
        {finishing ? "Finishing up..." : buttonLabel}
      </Button>
    </div>
  );
}