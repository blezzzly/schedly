"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SEEN_KEY = "schedly-update-announcement-seen";

function hasSeenAnnouncement(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return true;
  }
}

export function UpdateAnnouncement() {
  const [open, setOpen] = useState(() => !hasSeenAnnouncement());

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>We&apos;re back!</DialogTitle>
          <DialogDescription>
            Schedly was temporarily offline while we rolled out some updates.
            Everything should be working normally now — thanks for bearing with us!
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={dismiss} className="w-full">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
