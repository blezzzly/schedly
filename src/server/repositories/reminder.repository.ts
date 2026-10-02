import { db } from "@/server/db/client";

export interface CreateReminderData {
  classId: string;
  userId: string;
  minutesBefore?: number;
}

export const reminderRepository = {
  findById(id: string) {
    return db.reminder.findUnique({ where: { id } });
  },

  findByUser(userId: string) {
    return db.reminder.findMany({
      where: { userId },
      include: { class: true },
      orderBy: { createdAt: "desc" },
    });
  },

  findByClass(classId: string) {
    return db.reminder.findMany({ where: { classId } });
  },

  create(data: CreateReminderData) {
    return db.reminder.create({ data });
  },

  update(id: string, data: { minutesBefore?: number; isActive?: boolean }) {
    return db.reminder.update({ where: { id }, data });
  },

  delete(id: string) {
    return db.reminder.delete({ where: { id } });
  },

  deleteByClass(classId: string) {
    return db.reminder.deleteMany({ where: { classId } });
  },

  findActiveDue() {
    return db.reminder.findMany({
      where: { isActive: true },
      include: {
        class: { include: { schedule: true } },
        user: true,
      },
    });
  },
};
