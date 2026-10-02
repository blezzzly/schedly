import { db } from "@/server/db/client";
import type { FeedbackType } from "@/generated/prisma/client";

export interface CreateFeedbackData {
  userId: string;
  email?: string | null;
  type: FeedbackType;
  message: string;
  subject?: string | null;
  page?: string | null;
}

export const feedbackRepository = {
  findById(id: string) {
    return db.feedback.findUnique({ where: { id } });
  },

  findByUser(userId: string) {
    return db.feedback.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  create(data: CreateFeedbackData) {
    return db.feedback.create({ data });
  },

  countAll() {
    return db.feedback.count();
  },

  updateStatus(id: string, status: string) {
    return db.feedback.update({ where: { id }, data: { status } });
  },
};
