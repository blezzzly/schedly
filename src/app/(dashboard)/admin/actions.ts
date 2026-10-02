"use server";

import { auth } from "@/server/lib/auth";
import { headers } from "next/headers";
import { adminService } from "@/server/services/admin.service";
import { userRepository } from "@/server/repositories/user.repository";
import { auditLog } from "@/server/lib/audit";
import { db } from "@/server/db/client";
import { getLimitsStats } from "@/server/services/limits.service";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !(session.user as Record<string, unknown>).isAdmin) {
    throw new Error("Unauthorized");
  }
  return session;
}

async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return false;
  const bcrypt = await import("bcryptjs");
  const accounts = await db.account.findFirst({
    where: { userId, providerId: "email" },
    select: { password: true },
  });
  if (!accounts?.password) return false;
  return bcrypt.compare(password, accounts.password);
}

export async function getAdminStats() {
  await requireAdmin();
  return adminService.getStats();
}

export async function getLimitsStatsAction() {
  await requireAdmin();
  return getLimitsStats();
}

export async function getUsers() {
  await requireAdmin();
  return adminService.getUsers();
}

export async function getOnlineUsers() {
  await requireAdmin();
  // "Online" = active within the last 5 minutes
  return userRepository.findOnlineUsers(5 * 60 * 1000);
}

export async function getFeedbacks() {
  await requireAdmin();
  return adminService.getFeedbacks();
}

export async function sendThankYouNotification(userId: string) {
  const session = await requireAdmin();
  if (!userId) throw new Error("User ID is required");
  const result = await adminService.sendThankYouNotification(userId);
  auditLog("admin.action", {
    action: "notification.thank_you",
    callerId: session.user.id,
    targetUserId: userId,
  });
  return result;
}

export async function toggleAdminRole(userId: string, password: string) {
  const session = await requireAdmin();
  const valid = await verifyPassword(session.user.id, password);
  if (!valid) throw new Error("Invalid password. Re-authentication required.");
  const result = await adminService.toggleAdmin(userId, session.user.id);
  auditLog("user.admin_toggle", { targetUserId: userId, callerId: session.user.id });
  return result;
}

export async function sendBroadcastNotification(opts: {
  title?: string;
  message: string;
  targetUserId?: string;
}) {
  const session = await requireAdmin();
  const title = (opts.title || "Schedly").slice(0, 100);
  const message = opts.message.trim().slice(0, 500);
  if (!message) throw new Error("Message is required.");

  const result = await adminService.broadcastNotification({
    title,
    message,
    targetUserId: opts.targetUserId || undefined,
  });

  auditLog("admin.action", {
    action: "notification.broadcast",
    callerId: session.user.id,
    targetUserId: opts.targetUserId || null,
    title,
    sentTo: result.users,
    sentFcm: result.fcmSent,
    sentLegacy: result.legacySent,
  });

  return result;
}
