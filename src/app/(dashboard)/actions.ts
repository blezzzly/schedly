"use server";

import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { headers } from "next/headers";

const ALLOWED_CLIENT_TYPES = ["web", "pwa-android", "pwa-ios"] as const;

export type ClientType = (typeof ALLOWED_CLIENT_TYPES)[number];

/**
 * Records what the current user is running on (website, PWA, or Android APK)
 * so admins can see at a glance how each user accesses Schedly. Called
 * client-side after sign-in; refreshes `lastSeenAt` on every report and only
 * writes `clientType` when it actually changed.
 */
export async function reportClientType(clientType: string): Promise<{ ok: boolean }> {
  if (!ALLOWED_CLIENT_TYPES.includes(clientType as ClientType)) {
    return { ok: false };
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return { ok: false };

  const existing = await db.user.findUnique({
    where: { id: session.user.id },
    select: { clientType: true },
  });
  if (!existing) return { ok: false };

  await db.user.update({
    where: { id: session.user.id },
    data: {
      clientType: existing.clientType === clientType ? existing.clientType : clientType,
      lastSeenAt: new Date(),
    },
  });

  return { ok: true };
}