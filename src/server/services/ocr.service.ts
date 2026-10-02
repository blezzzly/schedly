/**
 * OCR-based timetable extraction service.
 *
 * Free, open-source pipeline:
 *
 *   Upload (image bytes)
 *     ↓
 *   1. Image hash (cached? → return cached result)
 *     ↓
 *   2. Image preprocessing (sharp + OpenCV adaptive thresholding)
 *     ↓
 *   3. tesseract.js OCR (words + bounding boxes)
 *     ↓
 *   4. Position-based parser (day/time/subject/room detection)
 *     ↓
 *   5. Validation + confidence scoring
 *     ↓
 *   6. Structured ExtractionResult (matches Schedly schema)
 *
 * No external AI/LLM calls. Cached results are served by perceptual image
 * hash, identical to the previous AI pipeline.
 */

import { extractionCache, computeImageHash } from "@/server/lib/image-cache";
import { ok, fail, type Result } from "@/server/lib/errors";
import { PipelineLogger } from "@/server/lib/structured-logger";
import { b2Client, B2_BUCKET } from "@/server/lib/b2-client";
import { incrementUsage, USAGE_SERVICES } from "@/server/lib/usage-counter";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/server/db/client";
import { preprocessForOcr, type PreprocessResult } from "@/server/lib/ocr/preprocess";
import { runTesseractOcr } from "@/server/lib/ocr/run-tesseract";
import { parseTimetableFromWords } from "@/server/lib/ocr/parse-words";
import { validateOcrSubjects } from "@/server/lib/ocr/validate";
import type { OcrTimetableResult, ValidationIssue } from "@/server/lib/ocr/types";

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

export interface OcrPipelineOptions {
  skipCache?: boolean;
  skipPreprocess?: boolean;
}

const EMPTY_RESULT: OcrTimetableResult = {
  classes: [],
  metadata: {
    totalClasses: 0,
    confidence: 0,
    layout: "unknown",
    notes: "No text detected from OCR",
    issues: [{ type: "ocr_empty", message: "OCR did not detect any text" }],
    ocrConfidence: 0,
    imageWidth: 0,
    imageHeight: 0,
  },
};

async function runOcrPipeline(
  imageBuffer: Buffer,
  opts: OcrPipelineOptions = {}
): Promise<Result<OcrTimetableResult>> {
  const runId = crypto.randomUUID();
  const t0 = performance.now();
  PipelineLogger.info("ocr-pipeline", "Pipeline start", { runId });

  try {
    let hash: string | null = null;
    if (!opts.skipCache && process.env.AI_CACHE_ENABLED !== "false") {
      hash = await computeImageHash(imageBuffer);
      const cached = await extractionCache.get(hash);
      if (cached) {
        PipelineLogger.info("ocr-cache", "Cache hit", { runId, hash });
        return ok(cached.result as OcrTimetableResult);
      }
    }

    const pt0 = performance.now();
    let preprocessed: PreprocessResult;
    try {
      preprocessed = opts.skipPreprocess
        ? { buffer: imageBuffer, width: 0, height: 0, strategy: "original" as const }
        : await preprocessForOcr(imageBuffer);
    } catch (preprocessErr) {
      PipelineLogger.warn("ocr-preprocess", "Preprocess failed, using original", { runId }, preprocessErr);
      preprocessed = { buffer: imageBuffer, width: 0, height: 0, strategy: "original" as const };
    }
    PipelineLogger.info("ocr-preprocess", "Preprocessed", {
      runId,
      strategy: preprocessed.strategy,
      preprocessMs: Math.round(performance.now() - pt0),
    });

    const ot0 = performance.now();
    const ocr = await runTesseractOcr({
      source: preprocessed.buffer,
      width: preprocessed.width,
      height: preprocessed.height,
    });
    PipelineLogger.info("ocr-recognize", "OCR complete", {
      runId,
      words: ocr.words.length,
      confidence: Math.round(ocr.confidence),
      ocrMs: Math.round(performance.now() - ot0),
    });

    if (ocr.words.length === 0) {
      await maybeCache(hash, imageBuffer, EMPTY_RESULT, runId, t0);
      return ok(EMPTY_RESULT);
    }

    const pt2 = performance.now();
    const parsed = parseTimetableFromWords(ocr.words, ocr.lines, {
      pageWidth: ocr.width,
      pageHeight: ocr.height,
    });
    PipelineLogger.info("ocr-parse", "Parser complete", {
      runId,
      subjects: parsed.subjects.length,
      layout: parsed.layout,
      parseMs: Math.round(performance.now() - pt2),
    });

    const vt = performance.now();
    const validated = validateOcrSubjects(parsed.subjects);
    const issues: ValidationIssue[] = [...parsed.issues, ...validated.issues];

    const overallConf = validated.classes.length > 0
      ? validated.classes.reduce((s, c) => s + c.confidence, 0) / validated.classes.length
      : 0;

    const result: OcrTimetableResult = {
      classes: validated.classes,
      metadata: {
        totalClasses: validated.classes.length,
        confidence: Math.round(overallConf * 100) / 100,
        layout: parsed.layout,
        notes: validated.classes.length === 0
          ? "No classes detected. The image may be blurry or in an unsupported layout."
          : null,
        issues,
        ocrConfidence: Math.round(ocr.confidence),
        imageWidth: ocr.width,
        imageHeight: ocr.height,
      },
    };

    PipelineLogger.info("ocr-validate", "Validation complete", {
      runId,
      classes: result.classes.length,
      issues: issues.length,
      confidence: result.metadata.confidence,
      validateMs: Math.round(performance.now() - vt),
      totalMs: Math.round(performance.now() - t0),
    });

    await maybeCache(hash, imageBuffer, result, runId, t0);
    return ok(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OCR processing failed";
    PipelineLogger.error("ocr-pipeline", "Pipeline failed", { runId }, err);
    return fail("AI_PROCESSING_FAILED", message);
  }
}

async function maybeCache(
  hash: string | null,
  imageBuffer: Buffer | null,
  result: OcrTimetableResult,
  runId: string,
  t0: number
) {
  if (process.env.AI_CACHE_ENABLED === "false" || !imageBuffer || !hash) return;
  try {
    await extractionCache.set(hash, result, "ocr");
    PipelineLogger.info("ocr-cache", "Result cached", {
      runId,
      hash,
      totalMs: Math.round(performance.now() - t0),
    });
  } catch (err) {
    PipelineLogger.warn("ocr-cache", "Failed to cache result", { runId }, err);
  }
}

export const ocrService = {
  async processImage(
    imageUrl: string,
    preloaded?: { data: Uint8Array | Buffer; mimeType: string },
  ): Promise<Result<OcrTimetableResult>> {
    const t0 = performance.now();
    try {
      const imageBuffer = preloaded
        ? Buffer.from(preloaded.data)
        : await fetchImageBytes(imageUrl);
      return await runOcrPipeline(imageBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : "OCR processing failed";
      PipelineLogger.error("ocr-service", "Failed", { totalMs: Math.round(performance.now() - t0) }, err);
      return fail("AI_PROCESSING_FAILED", message);
    }
  },
};
