"use client";

import { useState } from "react";
import { retry } from "@/lib/retry";
import { generateShortName } from "@/lib/abbreviations";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { friendlyError } from "@/server/lib/friendly-error";

export type ExtractedClass = {
  subject: string;
  shortName: string | null;
  code: string | null;
  instructor: string | null;
  room: string | null;
  section: string | null;
  block: string | null;
  notes: string | null;
  days: ("monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday")[];
  startTime: string;
  endTime: string;
};

type UploadStatus = {
  id: string;
  status: "pending" | "uploading" | "processing" | "completed" | "failed";
  progress: number;
  error?: string;
  fileUrl?: string;
};

type PollResult = {
  classes?: ExtractedClass[];
  metadata?: { confidence: number; notes?: string | null };
  fileUrl?: string;
  uploadId?: string;
};

export function useUpload() {
  const [upload, setUpload] = useState<UploadStatus | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedClasses, setExtractedClasses] = useState<ExtractedClass[]>([]);
  const [metadata, setMetadata] = useState<{ confidence: number; notes?: string | null } | null>(null);

  const settleCompleted = (result: Record<string, unknown>, fallbackId: string) => {
    const r = result as PollResult;
    setExtractedClasses(
      (r.classes || []).map((c) => ({
        ...c,
        shortName: c.shortName ?? (generateShortName(c.subject) || null),
      }))
    );
    setMetadata(r.metadata || { confidence: 0 });
    setUpload((prev) => prev ? {
      ...prev,
      status: "completed" as const,
      progress: 100,
      fileUrl: r.fileUrl,
      id: r.uploadId ?? fallbackId,
      error: undefined,
    } : null);
    setIsProcessing(false);
  };

  const settleFailed = (err: unknown, prefix = "") => {
    const msg = friendlyError(err, "schedule");
    setUpload((prev) => prev ? {
      ...prev,
      status: "failed" as const,
      error: prefix ? `${prefix}${msg}` : msg,
    } : null);
    setIsProcessing(false);
  };

  const pollStatus = (uploadId: string): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      // Transient failures (5xx, 429, network hiccups) must not kill a
      // processing upload — the server may be cold-starting or scaling.
      // Only definitive errors (401/403/404) stop the poll right away.
      let transientFails = 0;
      const MAX_TRANSIENT = 10;
      const interval = setInterval(async () => {
        try {
          const res = await authFetch(`/api/upload/${uploadId}`, {
            headers: { "x-csrf-protection": "1" },
          });
          if (res.status === 401 || res.status === 403 || res.status === 404) {
            clearInterval(interval);
            reject(
              new Error(
                res.status === 401
                  ? "Your session expired. Please sign in again and retry the upload."
                  : `Upload status check failed (${res.status}). Please retry.`
              )
            );
            return;
          }
          if (!res.ok) {
            transientFails += 1;
            if (transientFails > MAX_TRANSIENT) {
              clearInterval(interval);
              reject(new Error(`Failed to check upload status (${res.status}). Please try again.`));
            }
            return;
          }
          transientFails = 0;
          const text = await res.text();
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(text);
          } catch {
            clearInterval(interval);
            reject(new Error("Server returned an invalid response. Please try again."));
            return;
          }
          if (data.status === "completed") {
            clearInterval(interval);
            resolve(data);
          } else if (data.status === "failed") {
            clearInterval(interval);
            reject(new Error(typeof data.errorMessage === "string" ? data.errorMessage : "Processing failed"));
          }
        } catch (err) {
          transientFails += 1;
          if (transientFails > MAX_TRANSIENT) {
            clearInterval(interval);
            reject(err);
          }
        }
      }, 2500);

      // Give extraction up to 10 minutes — long enough for slow OCR/AI runs
      // plus cold starts on serverless functions.
      setTimeout(() => {
        clearInterval(interval);
        reject(new Error("Processing is taking longer than expected. Please try again."));
      }, 600_000);
    });

  const uploadFile = (file: File, ocrText?: string): Promise<Record<string, unknown>> => {
    const uploadId = crypto.randomUUID();
    setUpload({ id: uploadId, status: "uploading", progress: 0, error: undefined });
    setIsUploading(true);
    setProgress(0);
    setIsProcessing(false);
    setExtractedClasses([]);
    setMetadata(null);

    const doUpload = () => new Promise<Record<string, unknown>>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setProgress(pct);
          setUpload((prev) => prev ? { ...prev, progress: pct } : null);
        }
      });

      xhr.addEventListener("load", () => {
        setProgress(100);

        if (xhr.status === 401) {
          toast.error("Session expired. Please log in again.", {
            action: {
              label: "Log in",
              onClick: () => { window.location.href = "/login"; },
            },
            duration: Infinity,
          });
          setUpload((prev) => prev ? { ...prev, status: "failed", error: "Session expired. Please sign in again." } : null);
          setIsUploading(false);
          setIsProcessing(false);
          reject(new Error("Session expired. Please sign in again."));
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(xhr.responseText);
          } catch {
            setUpload((prev) => prev ? { ...prev, status: "failed", error: "Server returned an invalid response." } : null);
            setIsUploading(false);
            setIsProcessing(false);
            reject(new Error("Server returned an invalid response."));
            return;
          }
          const returnedUploadId = (typeof data.uploadId === "string" ? data.uploadId : uploadId);

          setIsUploading(false);
          setIsProcessing(true);
          setUpload((prev) => prev ? {
            ...prev,
            status: "processing",
            progress: 100,
            fileUrl: typeof data.fileUrl === "string" ? data.fileUrl : undefined,
            id: returnedUploadId,
            error: undefined,
          } : null);

          pollStatus(returnedUploadId)
            .then((result) => {
              settleCompleted(result, returnedUploadId);
              resolve(result);
            })
            .catch((pollErr) => {
              settleFailed(pollErr);
              reject(pollErr);
            });
        } else {
          // The server may return a plain-text / HTML error body (e.g. a 413
          // "Request entity too large" from the platform). Never surface the
          // raw parse error — map non-JSON responses to a friendly message.
          let friendly = `Upload failed (${xhr.status}). Please try again.`;
          if (xhr.status === 413) {
            friendly = "The file is too large to upload. Please choose a smaller image.";
          } else if (xhr.status === 429) {
            friendly = "Too many uploads. Please wait a moment and try again.";
          }
          try {
            const err = JSON.parse(xhr.responseText);
            friendly = (typeof err?.error === "string" && err.error) || friendly;
          } catch {
            // Non-JSON body — keep the friendly message above.
          }
          setUpload((prev) => prev ? { ...prev, status: "failed", error: friendly } : null);
          setIsUploading(false);
          setIsProcessing(false);
          reject(new Error(friendly));
        }
      });

      xhr.addEventListener("error", () => {
        setIsUploading(false);
        setIsProcessing(false);
        setUpload((prev) => prev ? { ...prev, status: "failed", error: "Network error" } : null);
        reject(new Error("Network error"));
      });

      xhr.addEventListener("abort", () => {
        setIsUploading(false);
        setIsProcessing(false);
        setUpload((prev) => prev ? { ...prev, status: "failed", error: "Upload cancelled" } : null);
        reject(new Error("Upload cancelled"));
      });

      xhr.open("POST", "/api/upload");
      xhr.setRequestHeader("x-csrf-protection", "1");

      const formData = new FormData();
      formData.append("file", file);
      if (ocrText) formData.append("ocrText", ocrText);

      xhr.send(formData);
    });

    return retry(doUpload, { maxRetries: 1, delayMs: 2000 });
  };

    // Re-attach to an upload that was started earlier (e.g. the user left the
  // page while the AI was still reading the photo). Picks up the server-side
  // progress and resolves with the classes once extraction completes.
  const resumeUpload = (uploadId: string): Promise<Record<string, unknown>> => {
    setUpload({ id: uploadId, status: "processing", progress: 100 });
    setIsUploading(false);
    setIsProcessing(true);
    setProgress(100);
    return pollStatus(uploadId)
      .then((result) => {
        settleCompleted(result, uploadId);
        return result;
      })
      .catch((err) => {
        settleFailed(err);
        throw err;
      });
  };

  const resetUpload = () => {
    setUpload(null);
    setIsUploading(false);
    setProgress(0);
    setIsProcessing(false);
    setExtractedClasses([]);
    setMetadata(null);
  };

  const updateExtractedClass = (index: number, updated: ExtractedClass) => {
    setExtractedClasses((prev) => prev.map((c, i) => (i === index ? updated : c)));
  };

  const removeExtractedClass = (index: number) => {
    setExtractedClasses((prev) => prev.filter((_, i) => i !== index));
  };

  const addExtractedClass = () => {
    setExtractedClasses((prev) => [
      ...prev,
      {
        subject: "",
        shortName: null,
        code: null,
        instructor: null,
        room: null,
        section: null,
        block: null,
        notes: null,
        days: [],
        startTime: "09:00",
        endTime: "10:00",
      },
    ]);
  };

  return {
    upload,
    isUploading,
    progress,
    isProcessing,
    uploadFile,
    resumeUpload,
    resetUpload,
    extractedClasses,
    metadata,
    setMetadata,
    restoreExtractedClasses: setExtractedClasses,
    updateExtractedClass,
    removeExtractedClass,
    addExtractedClass,
  };
}
