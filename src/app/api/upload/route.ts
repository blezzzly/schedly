import { type NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { uploadService } from "@/server/services/upload.service";
import { detectImageMime, checkRateLimitDb, validateCsrf } from "@/server/lib/security";
import { auditLog } from "@/server/lib/audit";
import { storeImage } from "@/server/services/file-store.service";
import { warmupOcr } from "@/server/lib/ocr-warmup";

export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the session's user actually exists in the database.
  // A stale better-auth cookie cache can reference a user that no longer
  // exists, which would otherwise violate the uploads_user_id_fkey.
  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser) {
    return NextResponse.json(
      { error: "Your session is invalid. Please sign out and sign in again." },
      { status: 401 }
    );
  }

  const rateCheck = await checkRateLimitDb(`upload:${session.user.id}`, 10, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  }

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 403 });
  }

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formErr) {
      console.error("[UPLOAD_API] Failed to parse form data:", formErr);
      return NextResponse.json(
        { error: "Invalid upload request. Make sure you are sending a multipart/form-data file." },
        { status: 400 }
      );
    }
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const detectedMime = detectImageMime(buffer);

    if (!detectedMime) {
      return NextResponse.json({ error: "File must be an image (JPEG, PNG, GIF, WebP, or BMP)" }, { status: 400 });
    }

    // Stored via Vercel Blob (fail-closed: if Blob is unavailable the upload
    // fails instead of persisting image bytes in Postgres). The row is created
    // alongside, so polling status works identically.
    const stored = await storeImage(
      session.user.id,
      buffer,
      detectedMime,
      file.name,
      { folder: "schedules", status: "processing" }
    );

    auditLog("upload.create", { userId: session.user.id, uploadId: stored.uploadId, fileName: file.name });

    // Pre-warm tesseract.js worker on first upload to eliminate cold start latency.
    void warmupOcr().catch(() => {});

    // Kick off extraction in the background so the upload response returns fast.
    // The client polls GET /api/upload/[id] until status flips to "completed"/"failed".
    // On Vercel, waitUntil keeps this invocation alive until extraction finishes.
    const origin = new URL(request.url).origin;
    const absoluteUrl = stored.url.startsWith("http")
      ? stored.url
      : `${origin}${stored.url}`;

    const task = uploadService.processUpload(stored.uploadId, absoluteUrl, {
      data: buffer,
      mimeType: detectedMime,
    });
    void waitUntil(task);
    void task.catch((err) => {
      console.error("[UPLOAD_API] Background extraction failed:", err);
    });

    return NextResponse.json({
      uploadId: stored.uploadId,
      fileUrl: stored.url,
      status: "processing",
    });
  } catch (error) {
    console.error("[UPLOAD_API] Error:", error);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}