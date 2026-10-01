"use client";

import { useSyncExternalStore } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { CaptureView } from "@/features/upload/components/capture-view";
import {
  getQuickAddSnapshot,
  getQuickAddServerSnapshot,
  subscribeQuickAdd,
  closeQuickAdd,
} from "@/lib/quick-add-sheet";

/**
 * Quick-add: the capture flow, opened from the bottom nav camera button and
 * from the "Upload Schedule" empty states.
 *
 * Renders as a bottom sheet on small screens and a centred dialog from `md`
 * up, so it works for the desktop CTAs too. It deliberately does NOT auto-open
 * the file/camera picker — the user has to tap "Take Photo" or "Choose File"
 * themselves, so the panel never yanks a system dialog open on appearance.
 */
export function QuickAddSheet() {
  const open = useSyncExternalStore(
    subscribeQuickAdd,
    getQuickAddSnapshot,
    getQuickAddServerSnapshot
  );

  if (!open) return null;

  return (
    <BottomSheet
      open={open}
      onClose={closeQuickAdd}
      variant="dialog"
      size="sm"
    >
      <CaptureView onClose={closeQuickAdd} onSaved={closeQuickAdd} />
    </BottomSheet>
  );
}
