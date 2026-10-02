import { userRepository } from "@/server/repositories/user.repository";
import { feedbackRepository } from "@/server/repositories/feedback.repository";
import { scheduleRepository } from "@/server/repositories/schedule.repository";
import { uploadRepository } from "@/server/repositories/upload.repository";
import { db } from "@/server/db/client";
import { notificationRepository } from "@/server/repositories/notification.repository";
import { sendFCMPush, isFcmConfigured } from "@/server/lib/firebase-admin";
import { sendPush, isVapidConfigured } from "@/server/lib/web-push";

export const adminService = {
  async getStats() {
    const [users, schedules, uploads, feedback] = await Promise.all([
      userRepository.countUsers(),
      scheduleRepository.countAll(),
      uploadRepository.countAll(),
      feedbackRepository.countAll(),
    ]);

    return { users, schedules, uploads, feedback };
  },

  async getUsers() {
    return userRepository.findAllUsers();
  },

  async getOnlineUsers(withinMs: number) {
    return userRepository.findOnlineUsers(withinMs);
  },

  async getFeedbacks() {
    return db.feedback.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            email: true,
          },
        },
      },
    });
  },

  async sendThankYouNotification(userId: string) {
    await notificationRepository.create({
      userId,
      type: "system",
      title: "Thanks for your feedback!",
      body: "We really appreciate you taking the time to share your thoughts. Your feedback helps us improve Schedly for everyone.",
    });
    return { success: true };
  },

  async toggleAdmin(userId: string, callerId: string) {
    if (userId === callerId) {
      throw new Error("Cannot change your own admin status");
    }

    const target = await userRepository.findById(userId);
    if (!target) throw new Error("User not found");

    return userRepository.toggleAdmin(userId, !target.isAdmin);
  },

  async broadcastNotification({
    title,
    message,
    targetUserId,
  }: {
    title: string;
    message: string;
    targetUserId?: string;
  }) {
    const userIds = targetUserId
      ? [targetUserId]
      : (await userRepository.findAllUserIds());
    if (userIds.length === 0) return { users: 0, fcmSent: 0, legacySent: 0 };

    await notificationRepository.createMany(
      userIds.map((userId) => ({
        userId,
        type: "system" as const,
        title,
        body: message,
      }))
    );

    let fcmSent = 0;
    let fcmFailed = 0;
    let legacySent = 0;
    const fcmErrors: unknown[] = [];

    if (isFcmConfigured()) {
      const tokenUsers = await db.fCMToken.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true },
        distinct: ["userId"],
      });
      await Promise.all(
        tokenUsers.map(async ({ userId }) => {
          const r = await sendFCMPush({
            userId,
            title,
            body: message,
            url: "/notifications",
            tag: `schedly-broadcast-${Date.now()}`,
          }).catch(() => ({ sent: 0, failed: 1, tokens: 0, errors: [] }));
          fcmSent += r.sent;
          fcmFailed += r.failed;
          if (r.errors?.length && fcmErrors.length < 5) {
            fcmErrors.push(...r.errors.slice(0, 1));
          }
        })
      );
    }

    if (isVapidConfigured()) {
      const subs = await db.pushSubscription.findMany({
        where: { userId: { in: userIds } },
        select: { endpoint: true, p256dh: true, auth: true },
      });
      await Promise.all(
        subs.map(async (sub) => {
          const r = await sendPush(sub, {
            title,
            body: message,
            url: "/notifications",
          }).catch(() => ({ ok: false as const, stale: false }));
          if (r.ok) legacySent++;
        })
      );
    }

    return {
      users: userIds.length,
      fcmSent,
      fcmFailed,
      legacySent,
      fcmErrors: fcmErrors.map((e) =>
        typeof e === "object" && e
          ? `${String((e as { code?: string }).code || "")} ${String((e as { message?: string }).message ?? "")}`.trim()
          : String(e)
      ),
      fcmConfigured: isFcmConfigured(),
      vapidConfigured: isVapidConfigured(),
    };
  },
};
