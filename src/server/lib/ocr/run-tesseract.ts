/**
 * Server-side OCR runner using tesseract.js.
 *
 * Wraps the existing `runOcr` helper in src/lib/ocr.ts so we get a worker-pool
 * lifecycle for free (tesseract.js spawns WASM workers and reuses them across
 * requests within the same Node.js process). On Vercel each serverless
 * invocation gets a fresh worker — that is fine because timetables are
 * typically one per request.
 *
 * Returns words + lines with their bounding boxes. Tesseract emits words in
 * reading order (top-to-bottom, left-to-right per line) which is the order
 * the parser expects.
 */

import { runOcr, type OcrWord, type OcrLine } from "@/lib/ocr";

export interface OcrPageInput {
  /** Image buffer or base64 data URL */
  source: Buffer | string;
  /** Optional override for the source image dimensions (used to align bboxes). */
  width?: number;
  height?: number;
}

export interface OcrPageOutput {
  text: string;
  words: OcrWord[];
  lines: OcrLine[];
  width: number;
  height: number;
  confidence: number;
}

/**
 * Run OCR on a preprocessed image. The image dimensions reported back come
 * from the buffer when possible (sharp metadata); otherwise we fall back to
 * a reasonable default (1000x1000) and let the parser treat positions as
 * normalized coordinates.
 */
export async function runTesseractOcr(input: OcrPageInput): Promise<OcrPageOutput> {
  const result = await runOcr(input.source);

  // Tesseract emits words/lines with bboxes relative to the input image.
  // When we don't know the actual width/height we fall back to the maximum
  // bbox coordinate so positions stay positive and useful for grouping.
  const computedWidth =
    input.width ??
    Math.max(
      1000,
      ...result.words.map((w) => w.bbox.x1)
    );
  const computedHeight =
    input.height ??
    Math.max(
      1000,
      ...result.words.map((w) => w.bbox.y1)
    );

  return {
    text: result.text,
    words: result.words,
    lines: result.lines,
    width: computedWidth,
    height: computedHeight,
    confidence: result.confidence,
  };
}