"use client";

import { useEffect } from "react";
import { listenForForegroundMessages } from "@/lib/firebase";

/** Renders FCM pushes while the app is in the foreground. Mounted once in the
 *  root layout so it works on every page (dashboard, admin, settings, ...). */
export function PushForegroundListener() {
  useEffect(() => {
    listenForForegroundMessages();
  }, []);
  return null;
}
