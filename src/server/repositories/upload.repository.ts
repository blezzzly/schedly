import { db } from "@/server/db/client";
import type { UploadStatus, Prisma } from "@/generated/prisma/client";

export interface CreateUploadData {
  userId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

const BASIC_FIELDS = {
  id: true,
  userId: true,
  scheduleId: true,
  fileUrl: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  status: true,
  aiResult: true,
  errorMessage: true,
  createdAt: true,
} as const satisfies Prisma.UploadSelect;

export const uploadRepository = {
  findById(id: string) {
    return db.upload.findUnique({ where: { id }, select: BASIC_FIELDS });
  },

  findByUser(userId: string) {
    return db.upload.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: BASIC_FIELDS,
    });
  },

  findBySchedule(scheduleId: string) {
    return db.upload.findMany({ where: { scheduleId }, select: BASIC_FIELDS });
  },

  /** Legacy reader for rows still stored in `file_data` (pre-Blob). Kept until
   *  the backfill migration moves those bytes to Vercel Blob. */
  findFileData(id: string) {
    return db.upload.findUnique({
      where: { id },
      select: { fileData: true, mimeType: true },
    });
  },

  create(data: CreateUploadData) {
    return db.upload.create({ data });
  },

  updateStatus(id: string, status: UploadStatus, errorMessage?: string | null) {
    return db.upload.update({
      where: { id },
      data: { status, errorMessage: errorMessage ?? null },
    });
  },

  updateAiResult(id: string, aiResult: Record<string, unknown>, status: UploadStatus) {
    return db.upload.update({
      where: { id },
      data: { aiResult: aiResult as never, status },
    });
  },

  linkSchedule(id: string, scheduleId: string) {
    return db.upload.update({
      where: { id },
      data: { scheduleId },
    });
  },

  delete(id: string) {
    return db.upload.delete({ where: { id } });
  },

  countAll() {
    return db.upload.count();
  },
};
