"use server";

import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { headers } from "next/headers";

export type PermissionState = {
  notificationsEnabled: boolean;
  locationEnabled: boolean;
  timezone: string;
} | null;

/** Read the persisted onboarding/permission state for the signed-in user.
 *  This is a fallback for restore — the real browser APIs are the source of
 *  truth for whether permissions are actually granted. */
export async function getPermissionState(): Promise<PermissionState> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      notificationsEnabled: true,
      locationEnabled: true,
      timezone: true,
    },
  });
  return user;
}

/** Persist permission preferences for the signed-in user. Only booleans and
 *  a short timezone string are accepted — never exposed to the client beyond
 *  what it sent. */
export async function updatePermissionState(input: {
  notificationsEnabled?: boolean;
  locationEnabled?: boolean;
  timezone?: string;
}): Promise<{ ok: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return { ok: false };

  const data: { notificationsEnabled?: boolean; locationEnabled?: boolean; timezone?: string } = {};
  if (typeof input.notificationsEnabled === "boolean") {
    data.notificationsEnabled = input.notificationsEnabled;
  }
  if (typeof input.locationEnabled === "boolean") {
    data.locationEnabled = input.locationEnabled;
  }
  if (typeof input.timezone === "string" && input.timezone.length <= 64) {
    data.timezone = input.timezone;
  }
  if (Object.keys(data).length === 0) return { ok: false };

  await db.user.update({ where: { id: session.user.id }, data });
  return { ok: true };
}
