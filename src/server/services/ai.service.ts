import {
  extractScheduleFromImage,
  validateExtractedData,
  CONFIDENCE_THRESHOLD,
} from "@/server/lib/ai";
import { aiValidationResultSchema } from "@/server/validators/ai.schema";
import { ok, fail, type Result } from "@/server/lib/errors";
import { PipelineLogger } from "@/server/lib/structured-logger";
import { extractionCache, computeImageHash } from "@/server/lib/image-cache";
import { preprocessImage } from "@/server/lib/image-processing";
import { b2Client, B2_BUCKET } from "@/server/lib/b2-client";
import { incrementUsage, USAGE_SERVICES } from "@/server/lib/usage-counter";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/server/db/client";
import {
  buildResult,
  finalizeValidated,
  type ExtractionResult,
} from "@/server/lib/extraction-deterministic";

/**
 * Fetch raw image bytes (needed for hashing/caching).
 *
 * B2-backed files (objectKey set) are streamed straight from the private
 * Backblaze bucket — no HTTP round-trip, immune to proxy/middleware redirects
 * returning HTML instead of the image. Legacy DB-backed rows are read from
 * Postgres. Any other URL is fetched over HTTP.
 */
async function fetchImageBytes(imageUrl: string): Promise<Buffer> {
  const match = imageUrl.match(/\/api\/upload\/([^/]+)\/file/);
  if (match) {
    const upload = await db.upload.findUnique({
      where: { id: match[1]! },
      select: { objectKey: true, fileData: true },
    });
    if (upload?.objectKey && B2_BUCKET) {
      const object = await b2Client().send(
        new GetObjectCommand({ Bucket: B2_BUCKET, Key: upload.objectKey })
      );
      if (object.Body) {
        const bytes = await object.Body.transformToByteArray();
        void incrementUsage(USAGE_SERVICES.B2_DOWNLOAD, { bytes: bytes.byteLength });
        return Buffer.from(bytes);
      }
    }
    if (upload?.fileData) {
      return Buffer.from(upload.fileData, "base64");
    }
  }
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export const aiService = {
  /**
   * Single-pass, low-latency extraction pipeline:
   *
   *   Upload -> image-hash cache lookup -> OpenCV/sharp preprocess
   *          -> Primary Vision Model (Gemma 4 26B) -> deterministic normalize + validate
   *          -> Confidence check
   *               >= threshold -> return (cache result)
   *               <  threshold -> retry with fallback Vision Model (escalate to Hy3 only if still unusable)
   *
   * Identical/near-identical uploads are served from cache, skipping all AI
   * calls. The Hy3 reasoning model runs ONLY on low-confidence/failed results.
   */
  async processImage(
    imageUrl: string,
    preloaded?: { data: Uint8Array | Buffer; mimeType: string },
  ): Promise<Result<ExtractionResult>> {
    const runId = crypto.randomUUID();
    const t0 = performance.now();
    PipelineLogger.info("pipeline", "Pipeline start", { runId, imageUrl });

    try {
      // 0. Fetch the bytes once — used for the cache hash AND reprocessed
      // before the model call, so the image is never downloaded twice.
      // When the caller already has the raw bytes in memory (upload flow) the
      // bytes are passed straight through, skipping the Backblaze GetObject
      // entirely — that download is a Class B transaction + bandwidth usage.
      const ct0 = performance.now();
      const imageBuffer = preloaded
        ? Buffer.from(preloaded.data)
        : await fetchImageBytes(imageUrl);

      // 1. Cache lookup by perceptual image hash (skips all AI work on repeats).
      let hash: string | null = null;
      if (process.env.AI_CACHE_ENABLED !== "false") {
        hash = await computeImageHash(imageBuffer);
        const cached = await extractionCache.get(hash);
        if (cached) {
          PipelineLogger.info("cache", "Cache hit — returning stored result", {
            runId,
            hash,
            model: cached.model,
            cacheMs: Math.round(performance.now() - ct0),
            totalMs: Math.round(performance.now() - t0),
          });
          return ok(cached.result as ExtractionResult);
        }
        PipelineLogger.debug("cache", "Cache miss", { runId, hash, cacheMs: Math.round(performance.now() - ct0) });
      }

      // 2. Preprocess BEFORE the AI call so the model reads an auto-rotated,
      // cropped, perspective-corrected table. Skipping this made times and
      // rooms easy to misread. Preprocessing is deterministic, so the cache key
      // above (a hash of the raw bytes) stays valid for repeat uploads.
      const pt0 = performance.now();
      let processedImage: Buffer;
      try {
        processedImage = await preprocessImage(imageBuffer);
      } catch (preprocessErr) {
        // Preprocessing is best-effort enhancement. If it fails (tiny/corrupt
        // source, unsupported pixel layout, etc.) fall back to the original
        // bytes so the model still gets a chance instead of failing the upload.
        PipelineLogger.warn("preprocess", "Preprocess failed — using original image", { runId }, preprocessErr);
        processedImage = imageBuffer;
      }
      PipelineLogger.info("preprocess", "Image preprocessed", {
        runId,
        preprocessMs: Math.round(performance.now() - pt0),
      });

      // 3. Primary vision extraction (single pass — the common path is ONE
      // AI call). Any usable result is returned immediately; low-confidence
      // results are fixed by the user in the review screen instead of burning
      // 2-3 more slow model calls.
      const primary = await extractScheduleFromImage(
        imageUrl,
        { base64: processedImage.toString("base64"), contentType: "image/jpeg" },
      );
      const raw = primary.data;

      const primaryResult = buildResult(raw);
      if (primaryResult && (primaryResult.metadata.confidence >= CONFIDENCE_THRESHOLD || (primaryResult.classes?.length ?? 0) > 0)) {
        await maybeCache(hash, imageBuffer, primaryResult, primary.model, runId, t0);
        return ok(primaryResult);
      }
      if (primaryResult) {
        PipelineLogger.info("pipeline", "Primary returned no usable classes", { runId });
      } else {
        PipelineLogger.warn("pipeline", "Primary extraction produced no parseable data", { runId });
      }

      // 2. Last resort: a single Hy3 re-validation pass when the vision model
      // came back with nothing usable.
      if (process.env.OPENROUTER_VALIDATION_ENABLED !== "false") {
        try {
          const validated = await validateExtractedData(raw);
          if (aiValidationResultSchema.safeParse(validated).success) {
            const res = finalizeValidated(validated);
            await maybeCache(hash, imageBuffer, res, "hy3", runId, t0);
            return ok(res);
          }
        } catch (valErr) {
          PipelineLogger.warn("pipeline", "Hy3 validation failed", { runId }, valErr);
        }
      }

      if (primaryResult) {
        await maybeCache(hash, imageBuffer, primaryResult, primary.model, runId, t0);
        return ok(primaryResult);
      }
      return fail("AI_PROCESSING_FAILED", "AI returned data in an unrecognized format");
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI processing failed";
      PipelineLogger.error("pipeline", "Pipeline failed", { runId }, err);
      return fail("AI_PROCESSING_FAILED", message);
    }
  },
};

async function maybeCache(
  hash: string | null,
  imageBuffer: Buffer | null,
  result: ExtractionResult,
  model: string,
  runId: string,
  t0: number,
) {
  if (process.env.AI_CACHE_ENABLED === "false" || !imageBuffer || !hash) return;
  try {
    await extractionCache.set(hash, result, model);
    PipelineLogger.info("cache", "Result cached", {
      runId,
      hash,
      model,
      totalMs: Math.round(performance.now() - t0),
    });
  } catch (err) {
    PipelineLogger.warn("cache", "Failed to cache result", { runId }, err);
  }
}
