import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/server/db/client";
import { b2Client, B2_BUCKET } from "@/server/lib/b2-client";
import { incrementUsage, USAGE_SERVICES } from "@/server/lib/usage-counter";

export type StoredFile = {
  url: string;
  uploadId: string;
  storedIn: "blob";
};

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

function extForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

type StoreOptions = {
  folder?: string;
  scheduleId?: string | null;
  status?: "pending" | "uploading" | "processing" | "completed" | "failed";
  /** Persist bytes in the database (`uploads.file_data`) as a fallback when
   *  B2 is unreachable or its cap is exceeded. Only safe for small files
   *  (avatars) — never enable for schedule images (Neon overage risk). */
  dbFallback?: boolean;
};

/**
 * Store an image file in Backblaze B2 (S3-compatible, zero-egress, free
 * tier, no payment method required — the bucket stays PRIVATE). Fail-closed:
 * if B2 is unreachable/misconfigured the upload fails loudly instead of
 * persisting bytes in Postgres (`uploads.file_data`), which caused the Neon
 * data-transfer overage. The database keeps only the B2 object key + the
 * internal serving URL (`/api/upload/{id}/file`), which streams bytes from
 * B2 — never from Neon.
 * Legacy rows already stored in `file_data` are untouched and still served
 * by the same route until the backfill migration moves them to B2.
 */
export async function storeImage(
  userId: string,
  data: Uint8Array,
  mime: string,
  fileName: string,
  opts: StoreOptions = {}
): Promise<StoredFile> {
  const status = opts.status ?? "completed";
  const dbFallback = opts.dbFallback ?? false;

  let objectKey: string | null = null;
  if (B2_BUCKET) {
    try {
      objectKey = `${opts.folder ?? "files"}/${userId}/${crypto.randomUUID()}.${extForMime(mime)}`;
      await b2Client().send(
        new PutObjectCommand({
          Bucket: B2_BUCKET,
          Key: objectKey,
          Body: Buffer.from(data),
          ContentType: mime,
        })
      );
    } catch (err) {
      if (!dbFallback) {
        console.error("[file-store] Backblaze B2 upload failed:", err);
        throw new Error("File storage unavailable — upload rejected (no database fallback)", { cause: err });
      }
      console.error("[file-store] B2 upload failed — persisting to database instead:", err);
      objectKey = null;
    }
  } else if (!dbFallback) {
    throw new Error("B2 storage not configured (B2_BUCKET missing)");
  }

  try {
    const upload = await db.upload.create({
      data: {
        userId,
        scheduleId: opts.scheduleId ?? null,
        fileUrl: "",
        objectKey,
        fileName,
        fileSize: data.byteLength,
        mimeType: mime,
        status,
        // DB fallback keeps the bytes serveable when B2 is capped/unconfigured.
        ...(objectKey === null ? { fileData: Buffer.from(data).toString("base64") } : {}),
      },
    });
    const url = `/api/upload/${upload.id}/file`;
    await db.upload.update({ where: { id: upload.id }, data: { fileUrl: url } });
    if (objectKey) {
      // Track B2 upload (Class C transaction) — cap dashboard.
      void incrementUsage(USAGE_SERVICES.B2_UPLOAD, { bytes: data.byteLength });
    }
    return { url, uploadId: upload.id, storedIn: "blob" };
  } catch (err) {
    console.error("[file-store] Database record failed:", err);
    throw new Error("File storage unavailable — upload rejected", { cause: err });
  }
}

/** Remove a stored file. B2-backed uploads delete the object AND the row;
 *  legacy DB-backed rows (`/api/upload/{id}/file`) delete the row only. */
export async function deleteStoredFileByUrl(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith("/api/upload/")) return;

  const match = url.match(/^\/api\/upload\/([^/]+)\/file$/);
  if (!match) return;

  const upload = await db.upload.findUnique({
    where: { id: match[1] },
    select: { objectKey: true },
  });
  if (upload?.objectKey && B2_BUCKET) {
    await b2Client()
      .send(new DeleteObjectCommand({ Bucket: B2_BUCKET, Key: upload.objectKey }))
      .catch(() => {});
  }
  await db.upload.delete({ where: { id: match[1] } }).catch(() => {});
}