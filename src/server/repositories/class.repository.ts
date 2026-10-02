import { db } from "@/server/db/client";
import type { DayOfWeek } from "@/generated/prisma/client";

export interface CreateClassData {
  scheduleId: string;
  subject: string;
  shortName?: string | null;
  code?: string | null;
  instructor?: string | null;
  room?: string | null;
  section?: string | null;
  block?: string | null;
  notes?: string | null;
  color: string;
  startTime: Date;
  endTime: Date;
  days: DayOfWeek[];
}

export interface UpdateClassData {
  subject?: string;
  shortName?: string | null;
  code?: string | null;
  instructor?: string | null;
  room?: string | null;
  section?: string | null;
  block?: string | null;
  notes?: string | null;
  color?: string;
  startTime?: Date;
  endTime?: Date;
  days?: DayOfWeek[];
}

export const classRepository = {
  findById(id: string) {
    return db.class.findUnique({ where: { id } });
  },

  findBySchedule(scheduleId: string) {
    return db.class.findMany({ where: { scheduleId }, orderBy: { startTime: "asc" } });
  },

  create(data: CreateClassData) {
    return db.class.create({ data });
  },

  createMany(data: CreateClassData[]) {
    return db.class.createMany({ data });
  },

  update(id: string, data: UpdateClassData) {
    return db.class.update({ where: { id }, data });
  },

  delete(id: string) {
    return db.class.delete({ where: { id } });
  },

  deleteBySchedule(scheduleId: string) {
    return db.class.deleteMany({ where: { scheduleId } });
  },

  countBySchedule(scheduleId: string) {
    return db.class.count({ where: { scheduleId } });
  },
};
