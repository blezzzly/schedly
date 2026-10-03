"use client";

import { useRef, useState, useTransition } from "react";
import { Check, ClipboardPaste, Copy, Share2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  createScheduleShareCode,
  importScheduleFromCode,
} from "@/app/(dashboard)/classes/actions";

const CODE_LENGTH = 6;

/* -------------------------------------------------------------------------- */
/* Share out — mints its own code, nothing to click                            */
/* -------------------------------------------------------------------------- */

/**
 * Share a schedule with a six-digit code.
 *
 * The code is minted when you press Share, not when this dialog opens.
 *
 * Minting on open was wrong in two ways that only showed up in real use. It
 * wrote a row to the database every single time the dialog was opened, including
 * the opens where you closed it again without sharing anything. And it copied
 * the code to the clipboard without being asked, so a six-digit number kept
 * landing in the clipboard after opening a dialog and changing your mind about
 * it — which then got pasted somewhere by accident. Both only happen on the
 * open-then-dismiss path, which is exactly the path nobody tests.
 *
 * A press is also the honest signal: sharing is a decision, and the cost of the
 * decision is one click rather than a silent side effect.
 *
 * The six-digit code is stored server-side rather than being the compressed
 * schedule itself: 1,000,000 combinations cannot hold a payload, so the code is
 * a lookup key.
 */
export function ScheduleShareDialog({
  open,
  onOpenChange,
  scheduleId,
  scheduleTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string | null;
  scheduleTitle: string;
}) {
  // Keyed per open so each visit to the dialog starts from the press again.
  // Remounting is how the state is cleared: an effect that resets on close is a
  // setState in an effect body, which costs a render pass and is exactly what
  // the lint rule warns about. A key does the same work for free.
  return (
    <ShareBody
      key={open ? "open" : "closed"}
      {...{ open, onOpenChange, scheduleId, scheduleTitle }}
    />
  );
}

function ShareBody({
  open,
  onOpenChange,
  scheduleId,
  scheduleTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string | null;
  scheduleTitle: string;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [minting, setMinting] = useState(false);

  const mint = () => {
    if (!scheduleId || minting) return;
    setMinting(true);
    setError(null);
    void createScheduleShareCode(scheduleId).then((res) => {
      setMinting(false);
      if (res.ok) setCode(res.code);
      else setError(res.error);
    });
  };

  const copy = () => {
    if (!code) return;
    void navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error("Couldn't copy — write the code down instead."),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Share schedule
          </DialogTitle>
          <DialogDescription>
            Copy this code into another account to copy{" "}
            {scheduleTitle ? `“${scheduleTitle}”` : "this schedule"} there.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">

          {error ? (
            <div className="space-y-3">
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </p>
              <Button className="w-full" onClick={mint} disabled={minting}>
                Try again
              </Button>
            </div>
          ) : code ? (
            <>
              <button
                type="button"
                onClick={copy}
                className="flex h-16 w-full items-center justify-center gap-2 rounded-lg border-2 border-foreground/70 bg-muted/30 font-mono text-3xl font-bold tracking-[0.35em] text-foreground transition-colors hover:bg-muted"
                aria-label={`Code ${code.split("").join(" ")}. Copy it.`}
              >
                {code}
                {copied ? (
                  <Check className="h-5 w-5 shrink-0 text-green-600 dark:text-green-500" />
                ) : (
                  <Copy className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
              </button>
              <p className="text-[11px] text-muted-foreground">
                {copied ? "Copied. You can paste it anywhere." : "Tap the code to copy it."}
              </p>
            </>
          ) : (
            <>
              <Button className="w-full" onClick={mint} disabled={minting || !scheduleId}>
                {minting ? (
                  <>
                    <Spinner size={16} className="mr-2" /> Making your code
                  </>
                ) : (
                  <>
                    <Share2 className="mr-2 h-4 w-4" /> Create share code
                  </>
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                One code, good for 24 hours, one person can use it.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Import in — the other half of the same action                               */
/* -------------------------------------------------------------------------- */

/**
 * Import a schedule from a six-digit code somebody else sent.
 *
 * Split from the share dialog rather than stacked below it: the two are the two
 * ends of one action, and you only ever need one of them. A shared timetable
 * arrives by code; sharing one is something you do deliberately from your own
 * schedule. Cramming both into one dialog meant reading past a code you didn't
 * come here to use.
 *
 * One box per digit rather than a single field, so a pasted code distributes
 * itself and the keyboard behaves the way people expect from an OTP.
 */
export function ScheduleImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}) {
  return <ImportBody key={open ? 1 : 0} {...{ open, onOpenChange, onImported }} />;
}

function ImportBody({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [importing, startImport] = useTransition();
  // So `onChange` can move focus without threading the DOM through every
  // handler — reading it at focus time avoids a stale ref, which is the usual
  // way "focus the next box" silently stops working after a re-render.
  const inputsRef = useRef<HTMLInputElement[] | null>(null);

  const enter = digits.every((d) => d !== "");
  const typed = digits.join("");

  const setDigit = (index: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  /** Paste distributes across the boxes, left to right, digits only. */
  const pasteInto = (text: string) => {
    const only = text.replace(/\D/g, "");
    if (only.length === 0) return;
    setDigits(Array.from({ length: CODE_LENGTH }, (_, i) => only[i] ?? ""));
  };

  const onChange = (index: number, raw: string) => {
    const only = raw.replace(/\D/g, "");
    if (only.length === 0) return;
    if (only.length > 1) {
      pasteInto(only);
      return;
    }
    setDigit(index, only);
    // Advance on type. Without it you have to tap each of the six boxes in
    // turn, which defeats the point of splitting the field at all — typing is
    // the normal way to enter a code you read off someone.
    const inputs = inputsRef.current;
    const next = inputs?.[index + 1];
    if (next) next.focus();
    else inputs?.[index]?.blur();
  };

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const inputs = inputsRef.current;
    if (!inputs) return;
    if (e.key === "Backspace" && digits[index] === "" && index > 0) {
      e.preventDefault();
      setDigit(index - 1, "");
      inputs[index - 1]?.focus();
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputs[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      e.preventDefault();
      inputs[index + 1]?.focus();
    }
  };

  const runImport = () => {
    startImport(async () => {
      const res = await importScheduleFromCode(typed);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const n = res.classCount;
      toast.success(`Added ${n} class${n !== 1 ? "es" : ""}.`);
      onImported?.();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Enter a code
          </DialogTitle>
          <DialogDescription>Enter the 6-digit code they sent you.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Import button on the LEFT, as asked. */}
          <div className="flex items-center gap-2">
            <Button onClick={runImport} disabled={!enter || importing} className="h-12 shrink-0 px-3 sm:px-4" aria-label="Import schedule">
              {importing ? (
                <>
                  <Spinner size={16} className="text-primary-foreground" />
                  <span className="hidden sm:inline">Adding…</span>
                </>
              ) : (
                <>
                  <ClipboardPaste className="h-4 w-4" />
                  <span className="hidden sm:inline">Import</span>
                </>
              )}
            </Button>

            <div
              className="flex flex-1 gap-1"
              onPaste={(e) => {
                e.preventDefault();
                pasteInto(e.clipboardData.getData("text"));
              }}
            >
              {digits.map((d, i) => (
                <input
                  key={i}
                  id={i === 0 ? "share-code-0" : `share-code-${i}`}
                  ref={(el) => {
                    if (el) {
                      inputsRef.current ??= [];
                      inputsRef.current[i] = el;
                    }
                  }}
                  value={d}
                  onChange={(e) => onChange(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onFocus={(e) => e.currentTarget.select()}
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={CODE_LENGTH}
                  aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
                  className="h-12 w-full min-w-0 rounded-lg border-2 border-foreground/70 bg-transparent px-0 text-center font-mono text-base font-bold tabular-nums text-foreground transition-colors focus-visible:border-foreground focus-visible:shadow-[3px_3px_0_0_#401f32] focus-visible:outline-none"
                />
              ))}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Adds a new schedule. Your current ones stay.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
