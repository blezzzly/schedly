import { feedbackRepository } from "@/server/repositories/feedback.repository";
import type { FeedbackType } from "@/generated/prisma/client";

export interface SubmitFeedbackInput {
  email?: string | null;
  type: FeedbackType;
  message: string;
  subject?: string | null;
  page?: string | null;
}

export const feedbackService = {
  async submit(userId: string, input: SubmitFeedbackInput) {
    return feedbackRepository.create({ userId, ...input });
  },

  async getByUser(userId: string) {
    return feedbackRepository.findByUser(userId);
  },

  async countAll() {
    return feedbackRepository.countAll();
  },
};
