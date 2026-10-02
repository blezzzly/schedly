import { db } from "@/server/db/client";

export const userRepository = {
  findById(id: string) {
    return db.user.findUnique({ where: { id } });
  },

  findByIdWithSessions(id: string) {
    return db.user.findUnique({
      where: { id },
      include: { sessions: true },
    });
  },

  findByIdWithSchedules(id: string) {
    return db.user.findUnique({
      where: { id },
      include: { schedules: { include: { classes: true } } },
    });
  },

  countUsers() {
    return db.user.count();
  },

  findAllUsers() {
    return db.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        username: true,
        isAdmin: true,
        emailVerified: true,
        clientType: true,
        lastSeenAt: true,
        createdAt: true,
        avatarUrl: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  findOnlineUsers(withinMs: number) {
    const since = new Date(Date.now() - withinMs);
    return db.user.findMany({
      where: { lastSeenAt: { gte: since } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        email: true,
        isAdmin: true,
        clientType: true,
        lastSeenAt: true,
        avatarUrl: true,
      },
      orderBy: { lastSeenAt: "desc" },
      take: 24,
    });
  },

  findAllUserIds() {
    return db.user.findMany({ select: { id: true } }).then((users) => users.map((u) => u.id));
  },

  updateAvatar(id: string, avatarUrl: string) {
    return db.user.update({ where: { id }, data: { avatarUrl } });
  },

  toggleAdmin(id: string, isAdmin: boolean) {
    return db.user.update({
      where: { id },
      data: { isAdmin },
      select: { id: true, isAdmin: true },
    });
  },

  countByDateRange(start: Date, end: Date) {
    return db.user.count({
      where: { createdAt: { gte: start, lte: end } },
    });
  },
};
