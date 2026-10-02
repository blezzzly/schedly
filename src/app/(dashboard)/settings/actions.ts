"use server";

import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { headers } from "next/headers";
import { detectImageMime } from "@/server/lib/security";
import { storeImage, deleteStoredFileByUrl } from "@/server/services/file-store.service";

export async function uploadAvatar(formData: FormData): Promise<{ url: string } | { error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return { error: "No file provided" };
  }

  if (file.size > 20 * 1024 * 1024) {
    return { error: "File must be under 20MB" };
  }

  const buffer = new Uint8Array(await file.arrayBuffer());

  // Prefer magic-byte detection; fall back to the browser's MIME type so
  // formats the detector doesn't know (HEIC, AVIF, …) still upload fine.
  let detectedMime = detectImageMime(buffer);
  if (!detectedMime && file.type.startsWith("image/")) {
    detectedMime = file.type;
  }
  if (!detectedMime) {
    return { error: "File must be an image (JPEG, PNG, GIF, WebP, BMP, HEIC, AVIF, …)" };
  }

  const ext = file.name.split(".").pop() || "jpg";
  const filename = `avatars/${session.user.id}-${Date.now()}.${ext}`;

  let blobUrl: string;
  try {
    // dbFallback: avatar bytes are tiny, so if B2 is capped/unreachable the
    // image still stores in the database and keeps rendering.
    const stored = await storeImage(session.user.id, buffer, detectedMime, filename, { dbFallback: true });
    blobUrl = stored.url;
  } catch (err) {
    console.error("[uploadAvatar] File store failed:", err);
    return { error: "Upload failed. Please try again." };
  }

  const h = await headers();

  try {
    await auth.api.updateUser({
      headers: h,
      body: { avatarUrl: blobUrl },
    });
  } catch (err) {
    console.error("[uploadAvatar] updateUser failed:", err);
    return { error: "Uploaded, but couldn't update your profile. Try again." };
  }

  return { url: blobUrl };
}

export async function removeAvatar(): Promise<{ ok: true } | { error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const h = await headers();
  const current = (session.user as { avatarUrl?: string | null }).avatarUrl;
  if (current) await deleteStoredFileByUrl(current);

  try {
    await auth.api.updateUser({
      headers: h,
      body: { avatarUrl: "" },
    });
    return { ok: true };
  } catch (err) {
    console.error("[removeAvatar] updateUser failed:", err);
    return { error: "Couldn't remove your photo. Try again." };
  }
}

export async function deleteAccount(username: string): Promise<{ ok: true } | { error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  // The client must type their exact username to confirm deletion.
  const userUsername = (session.user as Record<string, unknown>).username as string | undefined;
  if (!userUsername || username.trim() !== userUsername) {
    return { error: "Username does not match. Nothing was deleted." };
  }

  try {
    // All related data (schedules, classes, notes, to-dos, notifications,
    // sessions) is removed by the database's ON DELETE CASCADE.
    await db.user.delete({ where: { id: session.user.id } });
    return { ok: true };
  } catch (err) {
    console.error("[deleteAccount] Failed to delete user:", err);
    return { error: "Failed to delete account. Please try again." };
  }
}
