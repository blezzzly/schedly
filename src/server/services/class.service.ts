import { classRepository } from "@/server/repositories/class.repository";
import type { DayOfWeek } from "@/generated/prisma/client";
import type { Result } from "@/server/lib/errors";
import { ok, notFound } from "@/server/lib/errors";

export interface UpdateClassInput {
  subject?: string;
  shortName?: string | null;
  code?: string | null;
  instructor?: string | null;
  room?: string | null;
  section?: string | null;
  color?: string;
  startTime?: string;
  endTime?: string;
  days?: DayOfWeek[];
}

export const classService = {
  async getBySchedule(scheduleId: string) {
    return classRepository.findBySchedule(scheduleId);
  },

  async update(id: string, scheduleId: string, userId: string, input: UpdateClassInput): Promise<Result<unknown>> {
    const cls = await classRepository.findById(id);
    if (!cls) return notFound("Class not found");

    const now = new Date();
    const classData: Record<string, unknown> = {};

    if (input.subject !== undefined) classData.subject = input.subject;
    if (input.shortName !== undefined) classData.shortName = input.shortName ?? null;
    if (input.code !== undefined) classData.code = input.code ?? null;
    if (input.instructor !== undefined) classData.instructor = input.instructor ?? null;
    if (input.room !== undefined) classData.room = input.room ?? null;
    if (input.section !== undefined) classData.section = input.section ?? null;
    if (input.color !== undefined) classData.color = input.color;
    if (input.startTime !== undefined) {
      const [h = 0, m = 0] = input.startTime.split(":").map(Number);
      const d = new Date(now);
      d.setUTCHours(h, m, 0, 0);
      classData.startTime = d;
    }
    if (input.endTime !== undefined) {
      const [h = 0, m = 0] = input.endTime.split(":").map(Number);
      const d = new Date(now);
      d.setUTCHours(h, m, 0, 0);
      classData.endTime = d;
    }
    if (input.days !== undefined) classData.days = input.days;

    const updated = await classRepository.update(id, classData as Parameters<typeof classRepository.update>[1]);
    return ok(updated);
  },

  async delete(id: string): Promise<Result<void>> {
    const cls = await classRepository.findById(id);
    if (!cls) return notFound("Class not found");
    await classRepository.delete(id);
    return ok(undefined);
  },

  async detectOverlaps(scheduleId: string) {
    const classes = await classRepository.findBySchedule(scheduleId);
    const overlaps: Array<{ classA: typeof classes[0]; classB: typeof classes[0] }> = [];

    for (let i = 0; i < classes.length; i++) {
      for (let j = i + 1; j < classes.length; j++) {
        const a = classes[i]!;
        const b = classes[j]!;
        const sharedDays = a.days.filter((d) => b.days.includes(d));
        if (sharedDays.length === 0) continue;
        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          overlaps.push({ classA: a, classB: b });
        }
      }
    }

    return overlaps;
  },
};
