import { uploadRepository } from "@/server/repositories/upload.repository";
import { ocrService } from "@/server/services/ocr.service";
import { aiService } from "@/server/services/ai.service";
import { PipelineLogger } from "@/server/lib/structured-logger";

function hasAiProvider(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY || process.env.BYTEZ_API_KEY);
}

export const uploadService = {
  async getByUser(userId: string) {
    return uploadRepository.findByUser(userId);
  },

  async create(userId: string, file: { url: string; name: string; size: number; mimeType: string }) {
    return uploadRepository.create({
      userId,
      fileUrl: file.url,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.mimeType,
    });
  },

  async updateStatus(id: string, status: Parameters<typeof uploadRepository.updateStatus>[1], errorMessage?: string | null) {
    return uploadRepository.updateStatus(id, status, errorMessage);
  },

  /**
   * Free, OCR-based extraction (default).
   * Uses tesseract.js + position-based parsing — no paid AI API.
   */
  async processWithOcr(
    uploadId: string,
    imageUrl: string,
    preloaded?: { data: Uint8Array | Buffer; mimeType: string },
  ) {
    try {
      await uploadRepository.updateStatus(uploadId, "processing");
      const result = await ocrService.processImage(imageUrl, preloaded);

      if (!result.success) {
        await uploadRepository.updateStatus(uploadId, "failed", result.error.message);
        return { success: false as const, error: result.error.message };
      }

      await uploadRepository.updateAiResult(uploadId, JSON.parse(JSON.stringify(result.data)), "completed");
      return { success: true as const, data: result.data };
    } catch (err) {
      const message = err instanceof Error ? err.message : "OCR processing failed";
      await uploadRepository.updateStatus(uploadId, "failed", message);
      return { success: false as const, error: message };
    }
  },

  /**
   * AI extraction (primary). Falls back to OCR if all AI providers fail.
   * Priority: Gemini → OpenRouter → Groq → Bytez → OCR (Tesseract)
   */
  async processWithAi(
    uploadId: string,
    imageUrl: string,
    preloaded?: { data: Uint8Array | Buffer; mimeType: string },
  ) {
    try {
      await uploadRepository.updateStatus(uploadId, "processing");
      const result = await aiService.processImage(imageUrl, preloaded);

      if (!result.success) {
        PipelineLogger.warn("upload", "AI failed — falling back to OCR", { uploadId, error: result.error.message });
        return uploadService.processWithOcr(uploadId, imageUrl, preloaded);
      }

      await uploadRepository.updateAiResult(uploadId, JSON.parse(JSON.stringify(result.data)), "completed");
      return { success: true as const, data: result.data };
    } catch (err) {
      PipelineLogger.warn("upload", "AI exception — falling back to OCR", { uploadId }, err);
      return uploadService.processWithOcr(uploadId, imageUrl, preloaded);
    }
  },

  /**
   * Routes an upload through the best available extractor.
   *
   * Priority: AI (Gemini → OpenRouter → Groq → Bytez) → OCR (Tesseract)
   * AI is the default when any provider is configured. OCR is the last resort.
   */
  async processUpload(
    uploadId: string,
    imageUrl: string,
    preloaded?: { data: Uint8Array | Buffer; mimeType: string },
  ) {
    if (hasAiProvider()) {
      return uploadService.processWithAi(uploadId, imageUrl, preloaded);
    }
    return uploadService.processWithOcr(uploadId, imageUrl, preloaded);
  },

  async getById(id: string) {
    return uploadRepository.findById(id);
  },
};
