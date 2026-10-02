"use client";

import { useState } from "react";
import { Check, Copy, Heart } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const GCASH_NUMBER = "09477118531";
const GCASH_NAME = "NOSAIR H.";

function formatNumber(number: string): string {
  return number.replace(/(\d{4})(\d{3})(\d{4})/, "$1 $2 $3");
}

/** Small GCash "G" badge used as a subtle brand accent. */
function GcashBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-[#007DFE] font-bold text-white",
        className,
      )}
    >
      G
    </span>
  );
}

function CopyNumber({ number }: { number: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — ignore silently.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center gap-1.5 font-mono font-medium text-foreground transition-colors hover:text-primary"
    >
      {formatNumber(number)}
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground/60" />
      )}
    </button>
  );
}

/**
 * Subtle, optional "Support Schedly" section. Opens a small GCash payment
 * modal. Designed to feel low-pressure — a natural part of Settings, not an ad.
 */
export function SupportSchedly() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className="border-border/50 transition-all duration-300 hover:border-primary/30 hover:shadow-[0_6px_24px_rgba(0,0,0,0.05)]">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Heart className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Support Schedly</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Enjoying Schedly? If you&apos;d like to support the project, you can help us cover the
                costs of keeping Schedly running and improving.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground/70">
                Schedly will always be free to use. Any support is completely optional and greatly
                appreciated.
              </p>
              <Button
                onClick={() => setOpen(true)}
                className="mt-3 h-9 rounded-lg bg-primary/10 px-4 text-[13px] font-medium text-primary transition-all duration-200 hover:bg-primary/15 hover:shadow-sm active:scale-[0.98]"
              >
                <GcashBadge className="h-4 w-4 rounded text-[10px]" />
                Support via GCash
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Support Schedly</DialogTitle>
            <DialogDescription>
              Thank you for considering supporting Schedly. Your help goes toward keeping the app
              free and running smoothly for everyone.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-[#007DFE]/20 bg-[#007DFE]/5 p-4">
            <div className="flex items-center gap-2.5">
              <GcashBadge className="h-9 w-9 rounded-lg text-sm" />
              <div>
                <p className="text-sm font-semibold text-foreground">GCash</p>
                <p className="text-xs text-muted-foreground">Send your support here</p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 border-t border-[#007DFE]/10 pt-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Account name</span>
                <span className="font-medium text-foreground">{GCASH_NAME}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Mobile number</span>
                <CopyNumber number={GCASH_NUMBER} />
              </div>
            </div>
          </div>

          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </>
  );
}
