import { reminderRepository } from "@/server/repositories/reminder.repository";
import { classRepository } from "@/server/repositories/class.repository";

export interface CreateReminderInput {
  classId: string;
  minutesBefore?: number;
}

export const reminderService = {
  async getByUser(userId: string) {
    return reminderRepository.findByUser(userId);
  },

  async getById(id: string) {
    return reminderRepository.findById(id);
  },

  async getByClass(classId: string) {
    return reminderRepository.findByClass(classId);
  },

  async create(userId: string, input: CreateReminderInput) {
    const cls = await classRepository.findById(input.classId);
    if (!cls) return null;

    return reminderRepository.create({
      classId: input.classId,
      userId,
      minutesBefore: input.minutesBefore ?? 15,
    });
  },

  async update(id: string, data: { minutesBefore?: number; isActive?: boolean }) {
    return reminderRepository.update(id, data);
  },

  async delete(id: string) {
    return reminderRepository.delete(id);
  },

  async deleteByClass(classId: string) {
    return reminderRepository.deleteByClass(classId);
  },

  async getActiveDue() {
    return reminderRepository.findActiveDue();
  },
};
