"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ScheduleDesignEditor } from "@/features/upload/components/schedule-design-editor";
import {
  subscribeDesignState,
  getDesignStateSnapshot,
  getDesignStateServerSnapshot,
} from "@/features/upload/lib/design-state";
import { Button } from "@/components/ui/button";

export default function DesignPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const isAdmin = Boolean((user as { isAdmin?: boolean } | null)?.isAdmin);
  const state = useSyncExternalStore(
    subscribeDesignState,
    getDesignStateSnapshot,
    getDesignStateServerSnapshot
  );

  if (isLoading) return null;

  if (!isAdmin || !state) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-sm text-muted-foreground">Nothing to design yet.</p>
        <Button onClick={() => router.push("/classes")}>Go to Classes</Button>
      </div>
    );
  }

  return (
    <ScheduleDesignEditor
      classes={state.classes}
      imageUrl={state.imageUrl}
      onClose={() => router.back()}
    />
  );
}