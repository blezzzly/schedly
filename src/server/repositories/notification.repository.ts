import { db } from "@/server/db/client";
import type { NotificationType } from "@/generated/prisma/client";

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  scheduledAt?: Date | null;
}

export const notificationRepository = {
  findById(id: string) {
    return db.notification.findUnique({ where: { id } });
  },

  findByUser(userId: string) {
    return db.notification.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        read: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  findUnreadByUser(userId: string) {
    return db.notification.findMany({
      where: { userId, read: false },
      orderBy: { createdAt: "desc" },
    });
  },

  countUnread(userId: string) {
    return db.notification.count({ where: { userId, read: false } });
  },

  create(data: CreateNotificationData) {
    return db.notification.create({ data });
  },

  createMany(data: CreateNotificationData[]) {
    return db.notification.createMany({ data });
  },

  markAsRead(id: string) {
    return db.notification.update({ where: { id }, data: { read: true } });
  },

  markAllAsRead(userId: string) {
    return db.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  },

  delete(id: string) {
    return db.notification.delete({ where: { id } });
  },

  deleteAllByUser(userId: string) {
    return db.notification.deleteMany({ where: { userId } });
  },
};
