import { notificationRepository } from "@/server/repositories/notification.repository";
import type { NotificationType } from "@/generated/prisma/client";

export const notificationService = {
  async getByUser(userId: string) {
    return notificationRepository.findByUser(userId);
  },

  async getUnread(userId: string) {
    return notificationRepository.findUnreadByUser(userId);
  },

  async countUnread(userId: string) {
    return notificationRepository.countUnread(userId);
  },

  async create(userId: string, data: { type: NotificationType; title: string; body: string; scheduledAt?: Date | null }) {
    return notificationRepository.create({ userId, ...data });
  },

  async markAsRead(id: string) {
    return notificationRepository.markAsRead(id);
  },

  async markAllAsRead(userId: string) {
    return notificationRepository.markAllAsRead(userId);
  },

  async delete(id: string) {
    return notificationRepository.delete(id);
  },
};
