import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import { checkRateLimitDb, validateCsrf } from "@/server/lib/security";
import { storeImage } from "@/server/services/file-store.service";
import { processFlashcardData } from "@/server/workers/flashcard-worker";
import { friendlyError } from "@/server/lib/friendly-error";
import { extractPdfText } from "@/server/lib/pdf-extract";

export const maxDuration = 90;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];

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

  const rateCheck = await checkRateLimitDb(`flashcard-upload:${session.user.id}`, 5, 60_000);
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

  const files = formData.getAll("files") as File[];
  const singleFile = formData.get("file") as File | null;
  const allFiles = files.length > 0 ? files : (singleFile ? [singleFile] : []);
  const deckName = formData.get("deckName") as string | null;
  const subject = formData.get("subject") as string | null;
  const topic = formData.get("topic") as string | null;
  const cardCount = parseInt(formData.get("cardCount") as string || "10", 10);

  if (allFiles.length === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!deckName || !deckName.trim()) {
    return NextResponse.json({ error: "Deck name is required" }, { status: 400 });
  }

  if (deckName.length > 100) {
    return NextResponse.json({ error: "Deck name too long" }, { status: 400 });
  }

  const maxSize = 20 * 1024 * 1024;
  for (const file of allFiles) {
    if (file.size > maxSize) {
      return NextResponse.json({ error: `"${file.name}" exceeds 20MB limit` }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: `"${file.name}" is empty` }, { status: 400 });
    }
  }

  const fileMetas: Array<{ buffer: Uint8Array; fileName: string; mime: string; fileType: "pdf" | "image" }> = [];
  for (const file of allFiles) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const fileType = detectFileType(buffer);
    if (!fileType) {
      return NextResponse.json(
        { error: `Unsupported file type: "${file.name}". Please upload PDFs or images (JPG, PNG, WebP).` },
        { status: 400 }
      );
    }
    const mime: string = fileType === "pdf" ? "application/pdf" : (file.type || "image/jpeg");
    fileMetas.push({ buffer, fileName: file.name, mime, fileType });
  }

  const validCounts = [5, 10, 15, 20, 30];
  const finalCount = validCounts.includes(cardCount) ? cardCount : 10;

  try {
    const uploadIds: string[] = [];
    for (const meta of fileMetas) {
      const stored = await storeImage(
        session.user.id,
        meta.buffer,
        meta.mime,
        meta.fileName,
        { folder: "flashcards", status: "processing" }
      );
      uploadIds.push(stored.uploadId);
    }

    const combinedText: string[] = [];
    const images: Array<{ buffer: Buffer; mime: string; fileName: string }> = [];

    for (let i = 0; i < fileMetas.length; i++) {
      const meta = fileMetas[i]!;
      if (meta.fileType === "pdf") {
        const { text } = await extractPdfText(Buffer.from(meta.buffer));
        if (text && text.trim().length >= 50) {
          combinedText.push(`--- ${meta.fileName} ---\n${text}`);
        }
      } else {
        images.push({ buffer: Buffer.from(meta.buffer), mime: meta.mime, fileName: meta.fileName });
      }
    }

    // Process inline and return cards directly so the client can review them.
    const result = await processFlashcardData({
      uploadId: uploadIds[0]!,
      userId: session.user.id,
      buffers: fileMetas.map((m) => Buffer.from(m.buffer)),
      fileNames: fileMetas.map((m) => m.fileName as string),
      fileTypes: fileMetas.map((m) => m.fileType),
      mimes: fileMetas.map((m) => m.mime as string),
      combinedText: combinedText.join("\n\n"),
      imageBuffers: images.map((i) => i.buffer),
      imageMimes: images.map((i) => i.mime),
      deckName: deckName.trim(),
      subject: subject?.trim() || undefined,
      topic: topic?.trim() || undefined,
      cardCount: finalCount,
    });

    if (result.status === "failed") {
      return NextResponse.json(
        { error: friendlyError(result.error, "flashcard") },
        { status: 500 }
      );
    }

    // Read generated cards from the DB (saved by processFlashcardData)
    const upload = await db.upload.findUnique({
      where: { id: uploadIds[0] },
      select: { aiResult: true },
    });
    const cards = (upload?.aiResult as { cards?: Array<{ question: string; answer: string }> })?.cards ?? [];

    return NextResponse.json({
      uploadId: uploadIds[0],
      uploadIds,
      fileUrl: null,
      deckName: deckName.trim(),
      subject: subject?.trim() || null,
      topic: topic?.trim() || null,
      cardCount: cards.length,
      cards,
      status: "completed",
      message: "Flashcards generated successfully.",
    });
  } catch (err) {
    console.error("[FLASHCARD_UPLOAD]", err);
    return NextResponse.json(
      { error: friendlyError(err, "flashcard") },
      { status: 500 }
    );
  }
}
