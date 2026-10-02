import type { Job } from "bullmq";
import { generateFlashcards, generateFlashcardsFromImage } from "../lib/flashcard-extract";
import { db } from "../db/client";
import { extractPdfText } from "../lib/pdf-extract";

export interface FlashcardJobData {
  uploadId: string;
  userId: string;
  buffer?: Buffer;
  buffers?: Buffer[];
  fileName?: string;
  fileNames?: string[];
  fileType?: "pdf" | "image";
  fileTypes?: Array<"pdf" | "image">;
  mime?: string;
  mimes?: string[];
  combinedText?: string;
  imageBuffers?: Buffer[];
  imageMimes?: string[];
  deckName: string;
  subject?: string;
  topic?: string;
  cardCount: number;
}

export interface FlashcardJobResult {
  uploadId: string;
  cardsCount: number;
  status: "completed" | "failed";
  error?: string;
  provider?: string;
}

export async function processFlashcardData(
  data: FlashcardJobData,
  jobId?: string
): Promise<FlashcardJobResult> {
  const { uploadId, cardCount, topic } = data;

  console.log(`[FLASHCARD_WORKER] Processing job ${jobId || uploadId} for upload ${uploadId}`);

  const buffers: Buffer[] = data.buffers ?? (data.buffer ? [data.buffer] : []);
  const fileNames: string[] = data.fileNames ?? (data.fileName ? [data.fileName] : []);
  const fileTypes: Array<"pdf" | "image"> = data.fileTypes ?? (data.fileType ? [data.fileType] : []);
  const mimes: string[] = data.mimes ?? (data.mime ? [data.mime] : []);

  let combinedText: string = data.combinedText ?? "";
  const imageBuffers: Buffer[] = data.imageBuffers ?? [];
  const imageMimes: string[] = data.imageMimes ?? [];

  if (!combinedText) {
    for (let i = 0; i < buffers.length; i++) {
      if (fileTypes[i] === "pdf") {
        try {
          const buf = buffers[i] as Buffer;
          const { text } = await extractPdfText(buf);
          if (text && text.trim().length >= 50) {
            combinedText += `\n\n--- ${fileNames[i] || `Document ${i + 1}`} ---\n${text}`;
          }
        } catch (err) {
          console.error(`[FLASHCARD_WORKER] PDF parse failed for ${fileNames[i]}:`, err);
        }
      } else {
        imageBuffers.push(buffers[i] as Buffer);
        imageMimes.push(mimes[i] || "image/jpeg");
      }
    }
  }

  let cards: Array<{ question: string; answer: string }> = [];

  try {
    if (imageBuffers.length > 0) {
      const firstImage = imageBuffers[0] as Buffer;
      const firstMime = imageMimes[0] || "image/jpeg";
      const base64 = firstImage.toString("base64");
      const mimeType = firstMime.startsWith("image/") ? firstMime : "image/jpeg";
      const result = await generateFlashcardsFromImage(base64, mimeType, cardCount, topic);
      cards = result.cards;
    } else if (combinedText.trim().length >= 50) {
      const result = await generateFlashcards(combinedText, cardCount, topic);
      cards = result.cards;
    } else {
      await db.upload.update({
        where: { id: uploadId },
        data: { status: "failed", errorMessage: "Could not extract readable text from uploads" },
      });
      return { uploadId, cardsCount: 0, status: "failed", error: "Insufficient content" };
    }

    if (cards.length === 0) {
      throw new Error("No cards generated");
    }
  } catch (err) {
    console.error(`[FLASHCARD_WORKER] AI generation failed:`, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await db.upload.update({
      where: { id: uploadId },
      data: { status: "failed", errorMessage: message },
    });
    return { uploadId, cardsCount: 0, status: "failed", error: message };
  }

  await db.upload.update({
    where: { id: uploadId },
    data: {
      status: "completed",
      aiResult: { cards, provider: "ai-gateway" } as unknown as Record<string, unknown>,
    },
  });

  return { uploadId, cardsCount: cards.length, status: "completed" };
}

export async function processFlashcardJob(
  job: Job<FlashcardJobData>
): Promise<FlashcardJobResult> {
  return processFlashcardData(job.data, job.id);
}
