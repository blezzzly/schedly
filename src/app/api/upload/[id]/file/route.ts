import { type NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/server/db/client";
import { b2Client, B2_BUCKET } from "@/server/lib/b2-client";
import { incrementUsage, USAGE_SERVICES } from "@/server/lib/usage-counter";

/**
 * Serves uploaded images WITHOUT touching Neon:
 *  - B2-backed uploads (objectKey set) stream bytes straight from the
 *    private Backblaze bucket (no payment method required on the account).
 *  - Legacy rows persisted in `uploads.file_data` (pre-B2 era) are served
 *    from Postgres until the backfill migration moves them to B2.
 * Public by design — URLs are unguessable UUIDs, matching the previous
 * public-by-default behavior.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const upload = await db.upload.findUnique({
    where: { id },
    select: { objectKey: true, fileData: true, mimeType: true },
  });

  if (!upload) {
    return new NextResponse("Not found", { status: 404 });
  }

  const cacheHeaders = {
    "cache-control": "public, max-age=31536000, immutable",
  };

  if (upload.objectKey && B2_BUCKET) {
    try {
      const object = await b2Client().send(
        new GetObjectCommand({ Bucket: B2_BUCKET, Key: upload.objectKey })
      );
      if (!object.Body) throw new Error("empty body");
      const bytes = await object.Body.transformToByteArray();
      // Track B2 download (Class B transaction + bandwidth) — cap dashboard.
      void incrementUsage(USAGE_SERVICES.B2_DOWNLOAD, { bytes: bytes.byteLength });
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "content-type": object.ContentType ?? upload.mimeType ?? "application/octet-stream",
          "content-length": String(bytes.byteLength),
          ...cacheHeaders,
        },
      });
    } catch (err) {
      // B2 unavailable or cap exceeded — fall back to the DB copy (avatars)
      // rather than breaking the image; large B2-backed files have no copy.
      console.error("[UPLOAD_FILE] B2 read failed — falling back to DB copy:", err);
      if (!upload.fileData) {
        return new NextResponse("Not found", { status: 404 });
      }
    }
  }

  if (!upload.fileData) {
    return new NextResponse("Not found", { status: 404 });
  }

  const bytes = Buffer.from(upload.fileData, "base64");
  return new NextResponse(bytes, {
    headers: {
      "content-type": upload.mimeType || "application/octet-stream",
      "content-length": String(bytes.byteLength),
      ...cacheHeaders,
    },
  });
}