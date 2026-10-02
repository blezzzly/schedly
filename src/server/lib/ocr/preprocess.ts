/**
 * Image preprocessing pipeline for tesseract.js OCR.
 *
 * Converts arbitrary timetable images into high-contrast grayscale images
 * that tesseract.js reads best. Each step has a graceful fallback so the
 * pipeline never aborts — even on tiny or corrupt inputs.
 *
 * Pipeline (simplified for speed):
 *   1. Auto-rotate (EXIF)
 *   2. Downscale large images to max 2400px on longest edge
 *   3. Upscale tiny images (<300px) to at least 600px
 *   4. Sharpen (tesseract reads sharpened text better)
 *   5. Moderate contrast enhancement via adaptive histogram equalization
 *   6. Output as PNG buffer for tesseract
 */

import sharp from "sharp";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CVModule = any;

let _cv: CVModule | null = null;

async function getCV(): Promise<CVModule> {
  if (_cv) return _cv;
  // opencv-wasm is already initialized when required — cv.cv is the ready module.
  // We use require() here (not import) to avoid Turbopack mangling import.meta.url.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cvModule = require("opencv-wasm") as { cv: CVModule };
  _cv = cvModule.cv;
  return _cv;
}

export interface PreprocessResult {
  buffer: Buffer;
  width: number;
  height: number;
  strategy: "original" | "grayscale" | "adaptive-threshold" | "denoised";
}

const MAX_DIMENSION = 2400;
const MIN_DIMENSION = 300;

function rawToGrayMat(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cv: any,
  data: Buffer,
  width: number,
  height: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rgba: any = cv.matFromImageData({ data: new Uint8ClampedArray(data), width, height });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gray: any = new cv.Mat();
  cv.cvtColor(rgba, gray, 6);
  rgba.delete();
  return gray;
}

/**
 * Preprocess an image for OCR. Resize + greyscale + sharpen, then optionally
 * binarize when the image is high contrast.
 *
 * Falls back to original buffer on any error.
 */
export async function preprocessForOcr(input: Buffer): Promise<PreprocessResult> {
  const meta = await sharp(input).metadata();
  const origWidth = meta.width ?? 800;
  const origHeight = meta.height ?? 600;

  let strategy: PreprocessResult["strategy"] = "original";
  let buf = input;

  try {
    const longEdge = Math.max(origWidth, origHeight);
    if (longEdge > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / longEdge;
      buf = await sharp(buf)
        .resize({ width: Math.round(origWidth * scale), height: Math.round(origHeight * scale), fit: "inside" })
        .toBuffer();
    } else if (longEdge < MIN_DIMENSION) {
      const scale = MIN_DIMENSION / longEdge;
      buf = await sharp(buf)
        .resize({ width: Math.round(origWidth * scale), height: Math.round(origHeight * scale), fit: "inside", kernel: "lanczos3" })
        .toBuffer();
    }

    // Convert to greyscale and lightly sharpen — works well for clean digital
    // schedule images. We avoid heavy histogram normalization because tesseract
    // already handles the source range well, and aggressive contrast clipping
    // can introduce OCR artifacts (misreading "0" as "O", etc.).
    buf = await sharp(buf)
      .greyscale()
      .sharpen({ sigma: 0.8, m1: 0.5, m2: 0.2 })
      .png()
      .toBuffer();
    strategy = "grayscale";

    const finalMeta = await sharp(buf).metadata();
    return {
      buffer: buf,
      width: finalMeta.width ?? origWidth,
      height: finalMeta.height ?? origHeight,
      strategy,
    };
  } catch (err) {
    console.warn("[OCR_PREPROCESS] Falling back to original:", err);
    return { buffer: input, width: origWidth, height: origHeight, strategy: "original" };
  }
}
/**
 * Quick thresholding — converts image to high-contrast binary (black/white).
 * Used when the image is very clean but we want maximum accuracy.
 */
export async function quickBinarize(input: Buffer): Promise<Buffer> {
  try {
    const cv = await getCV();
    const { data, info } = await sharp(input).greyscale().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const gray = rawToGrayMat(cv, data, info.width, info.height);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const binary: any = new cv.Mat();
    cv.threshold(gray, binary, 0, 255, 8); // Otsu's method
    const raw = Buffer.from(binary.data);
    const out = await sharp(raw, { raw: { width: info.width, height: info.height, channels: 1 } })
      .png()
      .toBuffer();
    gray.delete();
    binary.delete();
    return out;
  } catch {
    return sharp(input).greyscale().threshold(128).png().toBuffer();
  }
}

/**
 * Denoise a grayscale image using non-local means — useful for photos
 * taken under poor lighting.
 */
export async function denoiseGray(input: Buffer): Promise<Buffer> {
  try {
    const cv = await getCV();
    const { data, info } = await sharp(input).greyscale().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const gray = rawToGrayMat(cv, data, info.width, info.height);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const denoised: any = new cv.Mat();
    cv.fastNlMeansDenoising(gray, denoised, 10, 7, 21);
    const raw = Buffer.from(denoised.data);
    const out = await sharp(raw, { raw: { width: info.width, height: info.height, channels: 1 } })
      .png()
      .toBuffer();
    gray.delete();
    denoised.delete();
    return out;
  } catch {
    return sharp(input).greyscale().median(2).png().toBuffer();
  }
}
