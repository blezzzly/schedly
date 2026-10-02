import { db } from "@/server/db/client";

export type ScheduleWithClasses = Awaited<ReturnType<typeof scheduleRepository.findById>>;

export const scheduleRepository = {
  findById(id: string) {
    return db.schedule.findUnique({ where: { id }, include: { classes: true } });
  },

  findByUser(userId: string) {
    return db.schedule.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        semester: true,
        academicYear: true,
        isActive: true,
        createdAt: true,
        classes: {
          select: {
            id: true,
            subject: true,
            shortName: true,
            code: true,
            instructor: true,
            room: true,
            section: true,
            block: true,
            notes: true,
            color: true,
            startTime: true,
            endTime: true,
            days: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  findActiveByUser(userId: string) {
    return db.schedule.findFirst({
      where: { userId, isActive: true },
      select: {
        id: true,
        title: true,
        semester: true,
        academicYear: true,
        isActive: true,
        createdAt: true,
        classes: {
          select: {
            id: true,
            subject: true,
            shortName: true,
            code: true,
            instructor: true,
            room: true,
            section: true,
            block: true,
            notes: true,
            color: true,
            startTime: true,
            endTime: true,
            days: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  create(data: {
    userId: string;
    title: string;
    semester?: string | null;
    academicYear?: string | null;
  }) {
    return db.schedule.create({ data });
  },

  update(id: string, data: { title?: string; semester?: string | null; academicYear?: string | null; isActive?: boolean }) {
    return db.schedule.update({ where: { id }, data });
  },

  delete(id: string) {
    return db.schedule.delete({ where: { id } });
  },

  countByUser(userId: string) {
    return db.schedule.count({ where: { userId } });
  },

  countAll() {
    return db.schedule.count();
  },

  findOwnedByUser(id: string, userId: string) {
    return db.schedule.findFirst({
      where: { id, userId },
      include: { classes: true },
    });
  },
};
