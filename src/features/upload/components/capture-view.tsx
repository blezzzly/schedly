"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useUpload } from "@/features/upload/hooks/use-upload";
import { ScheduleReview } from "@/features/upload/components/schedule-review";
import type { ExtractedClass } from "@/features/upload/hooks/use-upload";
import { saveSchedule, type SaveScheduleResult } from "@/app/(dashboard)/classes/actions";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Camera, Image as ImageIcon, AlertCircle, CheckCircle,
  Plus, RotateCcw, ArrowLeft,
} from "lucide-react";
import { ChaoticOrbit } from "ldrs/react";
import { compressImage } from "@/lib/image-compress";
import { validateExtractedClasses, type ValidationIssue } from "@/server/services/validation.service";
import { friendlyError } from "@/server/lib/friendly-error";
import { ReportErrorButton } from "@/components/report-error-dialog";
import { toast } from "sonner";
import {
  getReviewState,
  getReviewImage,
  saveReviewState,
  saveReviewImage,
  clearReviewState,
} from "@/features/upload/lib/review-state";
import {
  getUploadState,
  saveUploadState,
  clearUploadState,
  getProcessingStarted,
  saveProcessingStarted,
  clearProcessingStarted,
} from "@/features/upload/lib/upload-state";

type Phase = "upload-select" | "review";

export type CaptureViewProps = {
  /** Called when the user dismisses the panel before saving. */
  onClose?: () => void;
  /** Called after a schedule is saved, before routing to /classes. */
  onSaved?: () => void;
};

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.8 ? "bg-green-200 dark:bg-green-900/60 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300" :
    confidence >= 0.5 ? "bg-yellow-200 dark:bg-yellow-900/60 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300" :
    "bg-red-200 dark:bg-red-900/60 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300";
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${color}`}>
      <span className="font-semibold">{Math.round(confidence * 100)}% confident</span>
      <span className="opacity-60">— review as needed</span>
    </div>
  );
}

/**
 * The picked schedule photo, held back until the browser has actually decoded it.
 *
 * A schedule photo is a multi-megabyte camera image, and decoding one takes
 * long enough to be visible. Rendering the `<img>` immediately and letting the
 * browser sort it out showed an empty card, then a skeleton, then the picture:
 * three frames where the user sees something other than their own upload. Since
 * the image is already local as an object URL, waiting for `decode()` costs
 * nothing extra and removes the flash.
 */
function SchedulePreviewImage({ src }: { src: string }) {
  // Which src has finished decoding, rather than a boolean flag. A flag would
  // have to be reset inside the effect whenever `src` changes, and a setState in
  // an effect body is what React warns about: it costs an extra render pass and
  // shows a frame built from two different states. Comparing against `src`
  // during render gets the same answer with no reset and no extra pass.
  const [decodedSrc, setDecodedSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    const markDecoded = () => {
      if (!cancelled) setDecodedSrc(src);
    };
    img.onload = markDecoded;
    // A decode failure still shows the element: an <img> with a broken src is
    // more useful than a skeleton that never resolves.
    img.onerror = markDecoded;
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (decodedSrc !== src) {
    return (
      <div className="flex items-center justify-center py-16">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Schedule preview"
      className="mx-auto h-auto w-full object-contain"
      style={{ maxHeight: "280px" }}
    />
  );
}

export function CaptureView({ onClose, onSaved }: CaptureViewProps) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const u = user as ({ id?: string } & Record<string, unknown>) | null;

  const [phase, setPhase] = useState<Phase>("upload-select");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [title, setTitle] = useState("");
  const [semester, setSemester] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const {
    uploadFile, isUploading, progress, upload, isProcessing,
    extractedClasses, metadata,
    updateExtractedClass, removeExtractedClass, addExtractedClass, resetUpload,
    restoreExtractedClasses, setMetadata, resumeUpload,
  } = useUpload();

  const userId = (u as { id?: string } | null)?.id || "anon";

  // Resume an in-progress review (e.g., after coming back from the design
  // editor, which unmounts this view and clears its React state).
  const resumedRef = useRef(false);
  useEffect(() => {
    if (authLoading || resumedRef.current) return;
    const saved = getReviewState(userId);
    if (saved && saved.classes.length > 0) {
      clearUploadState(userId);
      restoreExtractedClasses(saved.classes);
      setMetadata(saved.confidence != null ? { confidence: saved.confidence } : null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValidationIssues(saved.validationIssues);
      setPreviewUrl(getReviewImage(userId));
      setPhase("review");
      return;
    }

    // No review yet — maybe the user left while the AI was still reading the
    // photo. Re-attach to the in-flight upload so the progress isn't lost.
    const pending = getUploadState(userId);
    if (pending && !selectedFile && !upload) {
      resumedRef.current = true;
      setSelectedFile({
        name: pending.fileName,
        size: pending.fileSize,
        type: pending.fileType,
      } as File);
      setPreviewUrl(pending.previewUrl);
      setPhase("upload-select");
      resumeUpload(pending.uploadId)
        .then((data) => {
          const classes = (data as { classes?: unknown[] }).classes;
          if (classes && classes.length > 0) {
            const result = validateExtractedClasses(
              classes as Parameters<typeof validateExtractedClasses>[0]
            );
            setValidationIssues(result.issues);
            setPhase("review");
          }
        })
        .catch(() => {
          // The failed status is reflected in `upload.error`.
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userId]);

  // Pre-warm tesseract.js as soon as the view loads. Runs in parallel with
  // everything else so it never blocks the UI. Worker stays warm for 10 min.
  useEffect(() => {
    if (authLoading) return;
    fetch("/api/upload/warmup", { method: "POST" }).catch(() => {});
  }, [authLoading]);

  // While the AI reads the photo, keep the upload id + preview in
  // localStorage so a tab switch doesn't lose the progress.
  useEffect(() => {
    if (phase !== "upload-select" || !selectedFile || upload?.status !== "processing" || !upload.id) return;
    saveUploadState(userId, {
      uploadId: upload.id,
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      fileType: selectedFile.type,
      previewUrl,
    });
  }, [phase, selectedFile, upload, userId, previewUrl]);

  // Keep the in-progress review in localStorage so it survives remounts.
  const reviewReady = phase === "review" && extractedClasses.length > 0;

  useEffect(() => {
    if (!reviewReady) return;
    saveReviewState(userId, {
      classes: extractedClasses,
      confidence: metadata?.confidence ?? null,
      validationIssues,
    });
  }, [reviewReady, userId, extractedClasses, metadata, validationIssues]);

  useEffect(() => {
    if (reviewReady && previewUrl) {
      saveReviewImage(userId, previewUrl);
    }
  }, [reviewReady, userId, previewUrl]);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file to upload.");
      return;
    }
    // Big phone photos can exceed the server's request-body limit, which makes
    // the upload fail with a confusing error. Downscale + re-encode in the
    // browser first so the image stays crisp but lands well under the limit.
    const processed = await compressImage(file).catch(() => file);
    setSelectedFile(processed);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(processed);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    resetUpload();
    clearUploadState(userId);
    clearProcessingStarted(userId);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    clearProcessingStarted(userId);
    setFakeProgress(0);
    try {
      const data = await uploadFile(selectedFile) as { classes?: unknown[] };
      if (data.classes && data.classes.length > 0) {
        const result = validateExtractedClasses(data.classes as Parameters<typeof validateExtractedClasses>[0]);
        setValidationIssues(result.issues);
        clearUploadState(userId);
        setPhase("review");
      }
    } catch (err) {
      console.error(err);
      toast.error(friendlyError(err, "schedule"));
    }
  };

  const [fakeProgress, setFakeProgress] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const origin = getProcessingStarted(userId);
    if (!origin) return 0;
    const elapsedSec = (Date.now() - origin) / 1000;
    return Math.round(90 * (1 - Math.exp(-elapsedSec / 18)));
  });

  const handleSave = async (validClasses: ExtractedClass[]) => {
    if (!title.trim()) {
      toast.error("Enter a schedule title");
      return;
    }
    const result: SaveScheduleResult = await saveSchedule({
      title: title.trim(),
      semester: semester.trim() || null,
      academicYear: academicYear.trim() || null,
      classes: validClasses,
      uploadId: upload?.id,
    });
    if (result.success) {
      clearReviewState(userId);
      clearUploadState(userId);
      clearProcessingStarted(userId);
      // Close the sheet before navigating so it isn't left mounted over the
      // classes list on the way out.
      onSaved?.();
      router.push("/classes");
      return;
    } else {
      toast.error(result.error ?? "Failed to save schedule");
    }
  };

  const handleBackToSelect = () => {
    removeFile();
    setValidationIssues([]);
    clearReviewState(userId);
    setPhase("upload-select");
  };

  const handleCreateManually = () => {
    // Skip upload, go straight to review with one blank class row so the
    // user can start typing immediately (Enter commits + adds the next row).
    setValidationIssues([]);
    clearReviewState(userId);
    clearUploadState(userId);
    resetUpload();
    addExtractedClass();
    setPhase("review");
  };

  // Extraction continues in the background and the client polls for status
  // (see use-upload). Real upload progress maps onto the first ~10%. While the
  // AI/OCR reads the image there is no true percentage, so we show a smooth
  // climb from ~1% toward ~90% that feels natural. It hits 100% once the
  // server sends "completed" status.
  const isAiWorking = isProcessing || (isUploading && progress >= 100);

  useEffect(() => {
    if (!isAiWorking) return;
    const origin = getProcessingStarted(userId) ?? Date.now();
    saveProcessingStarted(userId, origin);
    const tick = () => {
      const elapsedSec = (Date.now() - origin) / 1000;
      // Climb toward 90% over ~40s, then smoothly transition to 100% when done.
      setFakeProgress(Math.round(90 * (1 - Math.exp(-elapsedSec / 18))));
    };
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [isAiWorking, userId]);

  const displayProgress =
    upload?.status === "completed"
      ? 100
      : isAiWorking
        ? Math.min(90, Math.max(1, fakeProgress))
        : Math.max(1, Math.min(10, Math.round((progress / 100) * 10)));

  return (
    // `min-h-full` fills the panel's scroll area. Without a height here the
    // inner `flex-1 … justify-center` has nothing to distribute, so the card
    // sits top-aligned instead of centred. `px-4` keeps the review form off the
    // screen edges, and gives the sticky action bar inside it a padding to
    // cancel out against.
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 pb-6">
      {/* === REVIEW === */}
      {phase === "review" && (
        // Own spacing block — the panel root has no `space-y-*`, which would
        // leave these stacked flush against each other.
        <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background text-foreground shadow-sm transition-colors hover:bg-muted active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
        <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-sm space-y-3">
            {/* "Create manually instead" never uploads anything, so labelling
                the card "Uploaded Schedule" there was just wrong. */}
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {previewUrl ? "Uploaded Schedule" : "Schedule Details"}
            </p>
            <div className="flex gap-4">
              {/* Left: image thumbnail */}
              {previewUrl && (
                <div className="relative shrink-0 w-24 h-24 overflow-hidden rounded-xl border border-border/50 bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Uploaded schedule"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}

              {/* Right: schedule meta */}
              <div className="flex-1 min-w-0 space-y-2">
                <TextField
                  label="Schedule Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. My Class Schedule"
                />
                <div className="grid grid-cols-2 gap-2">
                  <TextField
                    label="Semester"
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    placeholder="1st Sem"
                  />
                  <TextField
                    label="Academic Year"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    placeholder="2025–2026"
                  />
                </div>
                {metadata?.confidence != null && (
                  <ConfidenceBadge confidence={metadata.confidence} />
                )}
              </div>
            </div>
        </div>
        {validationIssues.length > 0 && (
          <div className="rounded-xl border border-yellow-300 bg-yellow-100 dark:border-yellow-700 dark:bg-yellow-900/40 px-3 py-2 space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-yellow-800 dark:text-yellow-200">
              <AlertCircle className="h-4 w-4" />
              {validationIssues.length} warning{validationIssues.length !== 1 ? "s" : ""}
            </p>
            <ul className="space-y-0.5 pl-5">
              {validationIssues.map((issue, idx) => (
                <li key={idx} className="list-disc text-xs text-yellow-800 dark:text-yellow-300">
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <ScheduleReview
          classes={extractedClasses}
          designImageUrl={previewUrl ?? upload?.fileUrl}
          stickyActions
          onUpdate={updateExtractedClass}
          onRemove={removeExtractedClass}
          onAdd={addExtractedClass}
          onSave={handleSave}
          onCancel={handleBackToSelect}
        />
        </div>
      )}

      {/* === UPLOAD SELECT === */}
      {phase === "upload-select" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          {!selectedFile ? (
            <div className="w-full max-w-sm space-y-3">
              {/* Back button, top-left, matching the profile sheet. There's no
                  route behind this panel any more, so it simply dismisses. */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Back"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground shadow-sm transition-colors hover:bg-card hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="w-9" />
              </div>
              <div className="relative rounded-2xl border-2 border-border bg-card shadow-sm p-6">
                <h3 className="text-lg font-semibold text-foreground">Upload your schedule</h3>
                <p className="mt-1 max-w-xs mx-auto text-sm text-muted-foreground leading-relaxed">
                  Schedly will extract your classes automatically.
                </p>
                <div className="mt-5 flex w-full flex-row gap-3">
                  <Button className="flex-1 h-11 px-6 font-medium" onClick={() => document.getElementById("upload-camera")?.click()}>
                    <Camera className="mr-2 h-4 w-4" /> Take Photo
                  </Button>
                  <Button variant="outline" className="flex-1 h-11 px-6 font-medium" onClick={() => document.getElementById("upload-file")?.click()}>
                    <ImageIcon className="mr-2 h-4 w-4" /> Choose File
                  </Button>
                  <input id="upload-camera" type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                  <input id="upload-file" type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                </div>
                <Button
                  variant="ghost"
                  className="mt-3 w-full text-sm text-muted-foreground hover:text-primary"
                  onClick={handleCreateManually}
                >
                  <Plus className="mr-2 h-4 w-4" /> Create manually instead
                </Button>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-sm space-y-4">
              {/* Preview card */}
              <div className="relative rounded-2xl border-2 border-border bg-card shadow-sm overflow-hidden">
                {/* Image */}
                <div className="relative">
                  {previewUrl ? (
                    // Nothing is shown until the bitmap has actually decoded. The
                    // browser needs the image in memory before it can paint it, so
                    // rendering the <img> and relying on the browser to hold the
                    // frame produced a visible skeleton flash every time the
                    // preview was a large photo.
                    <SchedulePreviewImage src={previewUrl} />
                  ) : (
                    <div className="flex items-center justify-center py-16">
                      <Skeleton className="h-40 w-full" />
                    </div>
                  )}

                  {/* Scanning line overlay */}
                  {(isUploading || isProcessing) && (
                    <div className="pointer-events-none absolute inset-0 overflow-hidden">
                      <div className="animate-scan-line absolute left-0 right-0" />
                    </div>
                  )}
                </div>

                {/* Change button — top-left of the card */}
                {!isUploading && !isProcessing && (
                  <button
                    onClick={() => document.getElementById("upload-file-change")?.click()}
                    className="absolute left-2 top-2 z-10 flex items-center gap-1 h-7 px-2.5 rounded-full border border-border/60 bg-card/90 text-[11px] font-semibold text-muted-foreground shadow-sm transition-colors hover:bg-card hover:text-foreground"
                  >
                    <RotateCcw className="h-3 w-3" /> Change
                  </button>
                )}
                <input id="upload-file-change" type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />

                {/* File info */}
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-t border-border">
                  <div className="flex min-w-0 items-center gap-2">
                    <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
                    <p className="truncate text-sm font-medium text-foreground">{selectedFile.name}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>

                {/* Processing state */}
                {isUploading || isProcessing ? (
                  <div className="px-3 pb-3 pt-2 space-y-3">
                    <div className="flex items-center gap-3">
                      <ChaoticOrbit size="28" speed="1.5" color="var(--primary)" />
                      <span className="flex-1 text-sm font-medium text-foreground">
                        {isAiWorking ? "Reading your schedule" : "Uploading your schedule"}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                        {displayProgress}%
                      </span>
                    </div>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/10">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-200 ease-out"
                        style={{ width: `${displayProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 p-3 pt-2">
                    <Button variant="outline" onClick={removeFile} className="flex-1 h-11">
                      Cancel
                    </Button>
                    <Button onClick={handleUpload} className="flex-[1.4] h-11">
                      <CheckCircle className="mr-2 h-4 w-4" /> Extract Schedule
                    </Button>
                  </div>
                )}
              </div>

              {/* Error */}
              {upload?.error && (
                <div className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {upload.error}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    We&apos;re a bit busy right now. Try again in a moment.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => { resetUpload(); handleUpload(); }}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Try again
                    </Button>
                    <ReportErrorButton
                      context="Schedule upload / extraction"
                      errorMessage={upload.error ?? ""}
                      page="quick-add"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
