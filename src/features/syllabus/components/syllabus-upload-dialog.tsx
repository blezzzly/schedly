"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { SyllabusReview } from "./syllabus-review";
import { ReportErrorButton } from "@/components/report-error-dialog";

type ExtractionData = {
  course: Record<string, unknown>;
  requirements: Record<string, unknown>[];
};

type Step = "upload" | "review" | "saving" | "done";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function SyllabusUploadDialog({ open, onOpenChange, onSaved }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionData | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [progressText, setProgressText] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setUploading(false);
    setError(null);
    setExtraction(null);
    setFileId(null);
    setProgressText("");
    setProgressPct(0);
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  function startProgress() {
    setProgressPct(0);
    let pct = 0;
    progressTimerRef.current = setInterval(() => {
      // Slowing curve: fast at start, slow toward 95%
      const increment = Math.max(0.3, (100 - pct) * 0.02);
      pct = Math.min(pct + increment, 95);
      setProgressPct(Math.round(pct));
    }, 200);
  }

  function finishProgress() {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setProgressPct(100);
  }

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const validTypes = [
      "application/pdf",
      "image/jpeg", "image/png", "image/webp", "image/gif",
    ];
    if (!validTypes.includes(selected.type)) {
      setError("Please upload a PDF or image (JPG, PNG, WebP).");
      return;
    }

    if (selected.size > 20 * 1024 * 1024) {
      setError("File is too large. Maximum size is 20MB.");
      return;
    }

    setFile(selected);
    setError(null);
  }

  async function handleUpload() {
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgressText("Uploading file...");
    setProgressPct(5);

    try {
      const formData = new FormData();
      formData.append("file", file);

      setProgressText("Extracting text from PDF...");
      setProgressPct(15);
      await new Promise((r) => setTimeout(r, 500));

      setProgressText("Analyzing your syllabus...");
      setProgressPct(20);
      startProgress();

      const response = await fetch("/api/syllabus/upload", {
        method: "POST",
        body: formData,
        headers: { "x-csrf-protection": "1" },
      });

      finishProgress();
      setProgressPct(100);
      setProgressText("Done!");

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      await new Promise((r) => setTimeout(r, 400));
      setFileId(data.fileId);
      setExtraction(data.extraction);
      setStep("review");
    } catch (err) {
      finishProgress();
      setProgressPct(0);
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      const fakeEvent = { target: { files: [dropped] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(fakeEvent);
    }
  }

  const isAnalyzing = uploading && progressPct > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Add a Syllabus"}
            {step === "review" && "Review Extracted Syllabus"}
            {step === "saving" && "Saving..."}
            {step === "done" && "Syllabus Added!"}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload your PDF or syllabus image. Schedly will extract course information and academic requirements."}
            {step === "review" && "Extracted information. Please review dates and requirements before saving."}
            {step === "saving" && "Saving your syllabus and creating tasks..."}
            {step === "done" && "Your syllabus has been saved successfully."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            {/* Drop zone */}
            {!isAnalyzing && (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                {file ? (
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="font-medium mb-1">Click to upload or drag and drop</p>
                    <p className="text-sm text-muted-foreground">PDF, PNG, JPG, WEBP (max 20MB)</p>
                  </>
                )}
              </div>
            )}

            {/* Progress bar */}
            {isAnalyzing && (
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-3">
                  <Spinner size={18} className="text-primary shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{progressText}</p>
                  </div>
                  <span className="text-sm font-mono font-medium text-primary tabular-nums">
                    {progressPct}%
                  </span>
                </div>
                <ProgressBar value={progressPct} />
                <p className="text-xs text-muted-foreground text-center">
                  This may take up to a minute for large PDFs...
                </p>
              </div>
            )}

            {error && (
              <div className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
                <ReportErrorButton
                  context="Syllabus upload / extraction"
                  errorMessage={error ?? ""}
                  page="/syllabus"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose} disabled={uploading}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!file || uploading}>
                {uploading ? (
                  <>
                    <Spinner size={14} className="mr-1.5" />
                    Analyzing...
                  </>
                ) : (
                  "Extract Syllabus"
                )}
              </Button>
            </div>
          </div>
        )}

        {step === "review" && extraction && (
          <SyllabusReview
            extraction={extraction}
            fileId={fileId}
            fileName={file?.name}
            onSaved={onSaved}
            onCancel={handleClose}
          />
        )}

        {step === "done" && (
          <div className="flex flex-col items-center py-8">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Syllabus added successfully!</h3>
            <p className="text-sm text-muted-foreground mb-6 text-center">
              Your academic requirements have been organized.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={onSaved}>
                View Syllabi
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
