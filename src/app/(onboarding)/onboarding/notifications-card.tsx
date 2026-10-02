"use client";

import { useEffect, useState } from "react";
import { BellRing, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPushSupported, enablePush } from "@/lib/push";

type PermissionState = "default" | "granted" | "denied" | "unsupported" | "loading";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function NotificationsCard() {
  const [status, setStatus] = useState<PermissionState>("default");
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setIos(isIOS());
      if (typeof window !== "undefined" && "Notification" in window) {
        setStatus(Notification.permission as PermissionState);
      } else {
        setStatus("unsupported");
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const ask = async () => {
    if (!("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "granted") {
      setStatus("granted");
      return;
    }
    setStatus("loading");
    try {
      const result = await Notification.requestPermission();
      if (result === "granted") {
        // Register the device for native Web Push (VAPID) so class reminders
        // arrive even when the app isn't open — mirrors the notifications
        // page toggle.
        if (isPushSupported()) {
          await enablePush().catch(() => {});
        }
        setStatus("granted");
      } else {
        setStatus(result as PermissionState);
      }
    } catch {
      setStatus("unsupported");
    }
  };

  const granted = status === "granted";

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            granted ? "bg-green-500/15 text-green-600" : "bg-primary/12 text-primary"
          }`}
        >
          {granted ? <Check className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Allow notifications</p>
          <p className="text-xs text-muted-foreground">
            {granted
              ? "You’ll get reminders about your classes."
              : "Get reminders about your upcoming classes and schedule updates."}
          </p>
        </div>
      </div>

      {granted ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-600">
          <Check className="h-3.5 w-3.5" /> On
        </span>
      ) : (
        <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={ask} disabled={status === "loading" || status === "unsupported"}>
          {status === "loading" ? "Asking..." : status === "denied" ? "Blocked" : "Allow"}
        </Button>
      )}

      {status === "denied" && (
        <p className="text-xs text-muted-foreground">Notifications are blocked in browser settings.</p>
      )}

      {status === "unsupported" && (
        <p className="text-xs text-muted-foreground">Notifications aren’t available on this browser.</p>
      )}

      {ios && status === "default" && (
        <p className="text-xs text-muted-foreground">
          On iPhone, allow notifications after adding Schedly to your home screen.
        </p>
      )}
    </div>
  );
}