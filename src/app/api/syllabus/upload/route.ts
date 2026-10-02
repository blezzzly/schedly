import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { checkRateLimitDb, validateCsrf } from "@/server/lib/security";
import { extractSyllabusFromText, extractSyllabusFromImage } from "@/server/lib/syllabus-extract";
import { friendlyError } from "@/server/lib/friendly-error";
import { storeImage } from "@/server/services/file-store.service";
import { extractPdfText } from "@/server/lib/pdf-extract";

export const maxDuration = 300;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

function detectFileType(buffer: Uint8Array): "pdf" | "image" | null {
  if (buffer.length < 4) return null;
  if (PDF_MAGIC.every((b, i) => buffer[i] === b)) return "pdf";

  const IMAGE_MAGIC: [number[], "image"][] = [
    [[0xFF, 0xD8, 0xFF], "image"],
    [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], "image"],
    [[0x47, 0x49, 0x46, 0x38], "image"],
    [[0x52, 0x49, 0x46, 0x46], "image"],
    [[0x42, 0x4D], "image"],
  ];

  for (const [magic, type] of IMAGE_MAGIC) {
    if (magic.length > buffer.length) continue;
    if (magic.every((b, i) => buffer[i] === b)) return type;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const rateCheck = await checkRateLimitDb(`syllabus-upload:${session.user.id}`, 5, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  }

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
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
  const fileType = detectFileType(buffer);

  if (!fileType) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a PDF or image (JPG, PNG, WebP)." },
      { status: 400 }
    );
  }

  try {
    // Store file in B2
    const mime: string = fileType === "pdf" ? "application/pdf" : (file.type || "image/jpeg");
    const stored = await storeImage(
      session.user.id,
      buffer,
      mime,
      file.name,
      { folder: "syllabi", status: "processing" }
    );

    // Extract text and run AI extraction
    let extractionResult: { course: Record<string, unknown>; requirements: Record<string, unknown>[] };

    if (fileType === "pdf") {
      const { text: textContent } = await extractPdfText(Buffer.from(buffer));

      if (!textContent || textContent.trim().length < 20) {
        await db.upload.update({
          where: { id: stored.uploadId },
          data: { status: "failed", errorMessage: "Could not extract readable text from PDF" },
        });
        return NextResponse.json(
          { error: "We couldn't find readable syllabus content. Try uploading a clearer PDF." },
          { status: 422 }
        );
      }

      extractionResult = await extractSyllabusFromText(textContent) as { course: Record<string, unknown>; requirements: Record<string, unknown>[] };
    } else {
      // Image — send to Gemini vision
      const base64 = Buffer.from(buffer).toString("base64");
      const mimeType = mime.startsWith("image/") ? mime : "image/jpeg";
      extractionResult = await extractSyllabusFromImage(base64, mimeType) as { course: Record<string, unknown>; requirements: Record<string, unknown>[] };
    }

    // Update upload status
    await db.upload.update({
      where: { id: stored.uploadId },
      data: {
        status: "completed",
        aiResult: extractionResult as unknown as Record<string, unknown>,
      },
    });

    return NextResponse.json({
      uploadId: stored.uploadId,
      fileId: stored.uploadId,
      fileName: file.name,
      extraction: extractionResult,
    });
  } catch (err) {
    console.error("[SYLLABUS_UPLOAD]", err);
    return NextResponse.json(
      { error: friendlyError(err, "syllabus") },
      { status: 500 }
    );
  }
}
