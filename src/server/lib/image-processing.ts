import sharp from "sharp";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CVModule = any;

let _cv: CVModule | null = null;

async function getCV(): Promise<CVModule> {
  if (_cv) return _cv;
  // Use process.cwd() on Windows — import.meta.url resolves to C:\ROOT\... in Next.js dev
  const projectRoot = process.cwd();
  const opencvDir = path.join(projectRoot, "node_modules", "opencv-wasm");
  const wasmPath = path.join(opencvDir, "opencv.wasm");
  const { cv } = await import("opencv-wasm");
  const cvFn = cv as unknown as (mod: Record<string, unknown>) => Promise<CVModule>;
  return new Promise((resolve, reject) => {
    cvFn({
      locateFile: (p: string) => (p.endsWith(".wasm") ? wasmPath : p),
    }).then((mod: CVModule) => {
      _cv = mod;
      resolve(mod);
    }).catch(reject);
  });
}

/* ──────────────────────────────────────────────────────────────
  Image Quality Analysis
  ────────────────────────────────────────────────────────────── */

export interface QualityAnalysis {
 sharpness: number;
 brightness: number;
 contrast: number;
 blurDetected: boolean;
 tooDark: boolean;
 tooBright: boolean;
 overall: number;
}

export async function analyzeImageQuality(input: Buffer): Promise<QualityAnalysis> {
 const stats = await sharp(input).stats();

 const channels = stats.channels;
 const mean = channels.reduce((s, c) => s + c.mean, 0) / channels.length;
 const brightness = mean / 255;

 const std = channels.reduce((s, c) => s + c.stdev, 0) / channels.length;
 const contrast = Math.min(std / 128, 1);

 const maxCh = channels.reduce((m, c) => Math.max(m, c.max), 0);
 const minCh = channels.reduce((m, c) => Math.min(m, c.min), 255);
 const dynamicRange = (maxCh - minCh) / 255;

 const blurDetected = contrast < 0.15 || dynamicRange < 0.2;
 const tooDark = brightness < 0.2;
 const tooBright = brightness > 0.9;

 const sharpness = Math.min(contrast * 1.5, 1);

 const overall = Math.min(
  (brightness > 0.15 && brightness < 0.85 ? 1 : 0.3) *
  (contrast > 0.2 ? 1 : 0.4) *
  (blurDetected ? 0.4 : 1) *
  (tooDark || tooBright ? 0.3 : 1),
  1,
 );

 return { sharpness, brightness, contrast, blurDetected, tooDark, tooBright, overall };
}

/* ──────────────────────────────────────────────────────────────
  Helper — convert sharp RGBA raw → OpenCV Mat (BGR)
  ────────────────────────────────────────────────────────────── */

// Use `any` throughout for OpenCV WASM types — the API is dynamic Emscripten bindings
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawToBgrMat(cv: any, data: Buffer, width: number, height: number) {
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const rgba: any = cv.matFromImageData({
  data: new Uint8ClampedArray(data),
  width,
  height,
 });
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const bgr: any = new cv.Mat();
 cv.cvtColor(rgba, bgr, 3);
 rgba.delete();
 return bgr;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matToSharpBuffer(cv: any, mat: any): Promise<Buffer> {
 const ch = mat.channels();
 if (ch === 1) {
  return sharp(Buffer.from(mat.data), {
   raw: { width: mat.cols, height: mat.rows, channels: 1 },
  }).jpeg({ quality: 90 }).toBuffer();
 }
 if (ch === 3) {
  return sharp(Buffer.from(mat.data), {
   raw: { width: mat.cols, height: mat.rows, channels: 3 },
  }).jpeg({ quality: 90 }).toBuffer();
 }
 return sharp(Buffer.from(mat.data), {
  raw: { width: mat.cols, height: mat.rows, channels: 4 },
 }).jpeg({ quality: 90 }).toBuffer();
}

/* ──────────────────────────────────────────────────────────────
  Step 1 — Auto-rotate (sharp)
  ────────────────────────────────────────────────────────────── */

async function stepAutoRotate(input: Buffer): Promise<Buffer> {
 return sharp(input).rotate().toBuffer();
}

/* ──────────────────────────────────────────────────────────────
  Step 2 — Auto crop (OpenCV with sharp fallback)
  ────────────────────────────────────────────────────────────── */

async function stepAutoCrop(input: Buffer): Promise<Buffer> {
 try {
  const cv = await getCV();
  const { data, info } = await sharp(input)
   .ensureAlpha()
   .raw()
   .toBuffer({ resolveWithObject: true });

  const bgr = rawToBgrMat(cv, data, info.width, info.height);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gray: any = new cv.Mat();
  cv.cvtColor(bgr, gray, 6);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const binary: any = new cv.Mat();
  cv.threshold(gray, binary, 0, 255, 8);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contours: any = new cv.MatVector();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hierarchy: any = new cv.Mat();
  cv.findContours(binary, contours, hierarchy, 0, 2);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let bestRect: any = null;
  let bestArea = 0;

  for (let i = 0; i < contours.size(); i++) {
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   const c: any = contours.get(i);
   const area = cv.contourArea(c);
   if (area > 1000 && area > bestArea) {
    bestArea = area;
    const rect = cv.boundingRect(c);
    const margin = 10;
        bestRect = {
          left: Math.max(0, rect.x - margin),
          top: Math.max(0, rect.y - margin),
          width: Math.min(info.width - rect.x + margin, rect.width + margin * 2),
          height: Math.min(info.height - rect.y + margin, rect.height + margin * 2),
        };
      }
      c.delete();
    }

    contours.delete?.();
    hierarchy.delete();
    binary.delete();
    gray.delete();
    bgr.delete();

    if (bestRect && bestArea / (info.width * info.height) > 0.05) {
      return sharp(input).extract(bestRect).toBuffer();
  }
 } catch {
  // Fall through to sharp trim
 }

 // Fallback: sharp trim
 const trimmed = await sharp(input).trim({ threshold: 10 }).toBuffer();
 if (trimmed.length < Buffer.byteLength(input) * 0.95) {
  return trimmed;
 }
 return input;
}

/* ──────────────────────────────────────────────────────────────
  Step 3 — Perspective Correction
  ────────────────────────────────────────────────────────────── */

async function stepPerspectiveCorrection(input: Buffer): Promise<Buffer> {
 try {
  const cv = await getCV();
  const { data, info } = await sharp(input)
   .ensureAlpha()
   .raw()
   .toBuffer({ resolveWithObject: true });

  const bgr = rawToBgrMat(cv, data, info.width, info.height);
  const gray = new cv.Mat();
  cv.cvtColor(bgr, gray, 6 );

  const blurred = new cv.Mat();
  cv.GaussianBlur(
   gray, blurred, { width: 5, height: 5 }, 1.5,
  );

  const edges = new cv.Mat();
  cv.Canny(blurred, edges, 30, 120);

  const kernel = cv.getStructuringElement(
   2 , { width: 3, height: 3 },
  );
  const dilated = new cv.Mat();
  cv.dilate(edges, dilated, kernel);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(
   dilated, contours, hierarchy, 0 , 2 ,
  );

  let bestContour: unknown = null;
  let bestArea = 0;

  for (let i = 0; i < contours.size(); i++) {
   const c = contours.get(i);
   const peri = cv.arcLength(c, true);
   const approx = new cv.Mat();
   cv.approxPolyDP(c, approx, peri * 0.02, true);

   if (approx.rows === 4) {
    const area = cv.contourArea(approx);
    if (area > bestArea) {
     bestArea = area;
     bestContour = approx;
    } else {
     approx.delete();
    }
   } else {
    approx.delete();
   }
  }

  // Cleanup intermediate mats
  (kernel as { delete(): void }).delete?.();
  dilated.delete();
  edges.delete();
  blurred.delete();
  contours.delete();
  hierarchy.delete();
  gray.delete();

  if (!bestContour) {
   bgr.delete();
   return input;
  }

  // Order corners: top-left, top-right, bottom-right, bottom-left
  const pts = bestContour as { data32S: Int32Array; rows: number; delete(): void };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const corners: any[] = [];
    for (let i = 0; i < 4; i++) {
      corners.push({ x: pts.data32S[i * 2] ?? 0, y: pts.data32S[i * 2 + 1] ?? 0 });
    }
  pts.delete();

  // Sort by y then x to get proper ordering
  corners.sort((a, b) => a.y - b.y || a.x - b.x);
  const [topLeft, topRight2] = corners.slice(0, 2).sort((a, b) => a.x - b.x);
  const [bottomLeft, bottomRight] = corners.slice(2).sort((a, b) => a.x - b.x);

  const sortedSrc = cv.matFromArray(4, 1, 4 , [
   topLeft.x, topLeft.y,
   topRight2.x, topRight2.y,
   bottomRight.x, bottomRight.y,
   bottomLeft.x, bottomLeft.y,
  ]);

  const w = Math.max(
   Math.hypot(topRight2.x - topLeft.x, topRight2.y - topLeft.y),
   Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y),
  );
  const h = Math.max(
   Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y),
   Math.hypot(bottomRight.x - topRight2.x, bottomRight.y - topRight2.y),
  );
  const dstPts = cv.matFromArray(4, 1, 4 , [
   0, 0, w - 1, 0, w - 1, h - 1, 0, h - 1,
  ]);

  const M = cv.getPerspectiveTransform(sortedSrc, dstPts);
  const warped = new cv.Mat();
  cv.warpPerspective(
   bgr, warped, M, { width: Math.round(w), height: Math.round(h) },
  );

  (sortedSrc as { delete(): void }).delete();
  (dstPts as { delete(): void }).delete();
  (M as { delete(): void }).delete();
  bgr.delete();

  if (warped.rows > 10 && warped.cols > 10) {
   const result = await matToSharpBuffer(cv, warped);
   warped.delete();
   return result;
  }
  warped.delete();
 } catch {
  // Fall through
 }

 return input;
}

/* ──────────────────────────────────────────────────────────────
  Step 4 — Shadow Removal (OpenCV morphological)
  ────────────────────────────────────────────────────────────── */

async function stepShadowRemoval(input: Buffer): Promise<Buffer> {
 try {
  const cv = await getCV();
  const { data, info } = await sharp(input)
   .ensureAlpha()
   .raw()
   .toBuffer({ resolveWithObject: true });

  const bgr = rawToBgrMat(cv, data, info.width, info.height);

  // Convert to LAB
  const lab = new cv.Mat();
  cv.cvtColor(bgr, lab, 44 );

  // Extract L channel
  const channels = [
   new cv.Mat(),
   new cv.Mat(),
   new cv.Mat(),
  ];
  cv.split(lab, channels);

  // Estimate background illumination using large kernel closing
  const kernel = cv.getStructuringElement(
   0 , { width: 31, height: 31 },
  );
  const bg = new cv.Mat();
  cv.morphologyEx(
   channels[0], bg, 3 , kernel,
  );

  // Subtract background from L channel
  const result = new cv.Mat();
  cv.subtract(bg, channels[0], result);

  // Invert and add back
  const invResult = new cv.Mat();
  cv.subtract(
   cv.Mat.ones(info.height, info.width, 0 ),
   result, invResult,
  );

  // Clamp to 0-255 range
  const clamped = new cv.Mat();
  cv.add(channels[0], invResult, clamped);

  // Merge channels back
  channels[0].delete();
  (kernel as { delete(): void }).delete();
  bg.delete();
  result.delete();
  invResult.delete();

  const merged = new cv.Mat();
  cv.merge([clamped, channels[1], channels[2]], merged);
  channels[1].delete();
  channels[2].delete();
  clamped.delete();

  // Convert back to BGR
  const output = new cv.Mat();
  cv.cvtColor(merged, output, 56 );
  merged.delete();
  lab.delete();

  const resultBuf = await matToSharpBuffer(cv, output);
  output.delete();
  bgr.delete();
  return resultBuf;
 } catch {
  // Fall through
 }

 return input;
}

/* ──────────────────────────────────────────────────────────────
  Step 5 — Brightness Normalization
  ────────────────────────────────────────────────────────────── */

async function stepBrightnessNormalization(input: Buffer): Promise<Buffer> {
 try {
  const cv = await getCV();
  const { data, info } = await sharp(input)
   .ensureAlpha()
   .raw()
   .toBuffer({ resolveWithObject: true });

  const bgr = rawToBgrMat(cv, data, info.width, info.height);
  const normalized = new cv.Mat();
  cv.normalize(
   bgr, normalized, 0, 255, 32 , -1, null,
  );

  const result = await matToSharpBuffer(cv, normalized);
  normalized.delete();
  bgr.delete();
  return result;
 } catch {
  // Fall through
 }

 return sharp(input).normalize().toBuffer();
}

/* ──────────────────────────────────────────────────────────────
  Step 6 — Contrast Enhancement (CLAHE on L channel)
  ────────────────────────────────────────────────────────────── */

async function stepContrastEnhancement(input: Buffer): Promise<Buffer> {
 try {
  const cv = await getCV();
  const { data, info } = await sharp(input)
   .ensureAlpha()
   .raw()
   .toBuffer({ resolveWithObject: true });

  const bgr = rawToBgrMat(cv, data, info.width, info.height);

  const lab = new cv.Mat();
  cv.cvtColor(bgr, lab, 44 );

  const channels = [
   new cv.Mat(),
   new cv.Mat(),
   new cv.Mat(),
  ];
  cv.split(lab, channels);

  // Apply CLAHE on L channel
  const clahe = new (cv.CLAHE as new () => {
   setClipLimit(clipLimit: number): void;
   setTilesGridSize(size: { width: number; height: number }): void;
   apply(src: unknown, dst: unknown): void;
  })();
  clahe.setClipLimit(2.0);
  clahe.setTilesGridSize({ width: 8, height: 8 });
  const enhanced = new cv.Mat();
  clahe.apply(channels[0], enhanced);

  const merged = new cv.Mat();
  cv.merge([enhanced, channels[1], channels[2]], merged);
  enhanced.delete();
  channels[0].delete();
  channels[1].delete();
  channels[2].delete();

  const output = new cv.Mat();
  cv.cvtColor(merged, output, 56 );
  merged.delete();
  lab.delete();

  const result = await matToSharpBuffer(cv, output);
  output.delete();
  bgr.delete();
  return result;
 } catch {
  // Fall through
 }

 return sharp(input).gamma(1.3).toBuffer();
}

/* ──────────────────────────────────────────────────────────────
  Step 7 — Image Sharpening
  ────────────────────────────────────────────────────────────── */

async function stepSharpening(input: Buffer): Promise<Buffer> {
 try {
  const cv = await getCV();
  const { data, info } = await sharp(input)
   .ensureAlpha()
   .raw()
   .toBuffer({ resolveWithObject: true });

  const bgr = rawToBgrMat(cv, data, info.width, info.height);

  // Sharpening kernel
  const kernelData = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const kernel = cv.matFromArray(3, 3, 5 , kernelData);

  const sharpened = new cv.Mat();
  cv.filter2D(bgr, sharpened, -1, kernel);

  (kernel as { delete(): void }).delete();
  bgr.delete();

  const result = await matToSharpBuffer(cv, sharpened);
  sharpened.delete();
  return result;
 } catch {
  // Fall through
 }

  return sharp(input).sharpen(1.2, 1, 0.5).toBuffer();
}

/* ──────────────────────────────────────────────────────────────
  Step 8 — Noise Reduction
  ────────────────────────────────────────────────────────────── */

async function stepNoiseReduction(input: Buffer): Promise<Buffer> {
 try {
  const cv = await getCV();
  const { data, info } = await sharp(input)
   .ensureAlpha()
   .raw()
   .toBuffer({ resolveWithObject: true });

  const bgr = rawToBgrMat(cv, data, info.width, info.height);

  const denoised = new cv.Mat();
  cv.bilateralFilter(
   bgr, denoised, 5, 50, 50,
  );

  bgr.delete();

  const result = await matToSharpBuffer(cv, denoised);
  denoised.delete();
  return result;
 } catch {
  // Fall through
 }

 return sharp(input).median(1).toBuffer();
}

/* ──────────────────────────────────────────────────────────────
  Step 9 — Resolution Upscaling
  ────────────────────────────────────────────────────────────── */

async function stepResolutionUpscaling(input: Buffer, maxDimension = 1600): Promise<Buffer> {
 const meta = await sharp(input).metadata();
 const width = meta.width ?? 0;
 const height = meta.height ?? 0;

 if (width < 200 && height < 200) {
  const scale = Math.min(maxDimension / width, maxDimension / height);
  return sharp(input)
   .resize({
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    fit: "inside",
    withoutEnlargement: false,
    kernel: "lanczos3",
   })
   .jpeg({ quality: 90 })
   .toBuffer();
 }

 if (width > maxDimension || height > maxDimension) {
  return sharp(input)
   .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
   .jpeg({ quality: 85 })
   .toBuffer();
 }

 return input;
}

/* ──────────────────────────────────────────────────────────────
  Full Pipeline
  ────────────────────────────────────────────────────────────── */

export interface PreprocessOptions {
 autoCrop?: boolean;
 perspectiveCorrection?: boolean;
 autoRotate?: boolean;
 removeShadows?: boolean;
 brightnessNormalization?: boolean;
 contrastEnhancement?: boolean;
 sharpen?: boolean;
 denoise?: boolean;
 resolutionUpscale?: boolean;
 maxDimension?: number;
}

const DEFAULTS: PreprocessOptions = {
  autoRotate: true,
  autoCrop: false,
  perspectiveCorrection: false,
  removeShadows: false,
  brightnessNormalization: false,
  contrastEnhancement: false,
  sharpen: false,
  denoise: false,
  resolutionUpscale: true,
  maxDimension: 1600,
};

/**
 * Full image preprocessing pipeline.
 *
 * 1. Auto-rotate (EXIF)
 * 2. Auto crop (OpenCV contour detection → sharp trim fallback)
 * 3. Perspective correction (OpenCV find-quadrilateral → warpPerspective)
 * 4. Shadow removal (OpenCV morphological background subtraction on LAB L-channel)
 * 5. Brightness normalization (OpenCV histogram stretch → sharp normalize fallback)
 * 6. Contrast enhancement (OpenCV CLAHE on LAB L-channel → sharp gamma fallback)
 * 7. Image sharpening (OpenCV filter2D kernel → sharp sharpen fallback)
 * 8. Noise reduction (OpenCV bilateralFilter → sharp median fallback)
 * 9. Resolution upscaling (sharp lanczos3)
 *
 * Each step has a try/catch so a failure in any step falls back gracefully.
 */
export async function preprocessImage(
 input: Buffer,
 opts: PreprocessOptions = {},
): Promise<Buffer> {
 const options = { ...DEFAULTS, ...opts };

 let buf = input;

// Fast path: skip heavy OpenCV steps if the image is already clean.
  const quality = await analyzeImageQuality(buf);
  if (quality.overall >= 0.7) {
    buf = await stepAutoRotate(buf);
    if (options.resolutionUpscale) {
      buf = await stepResolutionUpscaling(buf, options.maxDimension);
    }
    return sharp(buf).jpeg({ quality: 90, force: true }).toBuffer();
  }

  // Lightweight normalization (sharp-only) — no OpenCV WASM loading, fast.
  if (options.brightnessNormalization || options.contrastEnhancement) {
    const operations = [];
    if (quality.brightness < 0.4) operations.push({ gamma: 3.0 });
    if (quality.brightness > 0.85) operations.push({ gamma: 0.7 });
    if (quality.brightness < 0.4 || quality.brightness > 0.85) {
      buf = await sharp(buf).gamma(2.0).normalize().toBuffer();
    }
  }

  if (options.autoRotate) {
    buf = await stepAutoRotate(buf);
  }

 if (options.autoCrop) {
   buf = await stepAutoCrop(buf);
 }

 if (options.perspectiveCorrection) {
   buf = await stepPerspectiveCorrection(buf);
 }

 if (options.removeShadows) {
   buf = await stepShadowRemoval(buf);
 }

 if (options.brightnessNormalization) {
   buf = await stepBrightnessNormalization(buf);
 }

 if (options.contrastEnhancement) {
   buf = await stepContrastEnhancement(buf);
 }

 if (options.sharpen) {
   buf = await stepSharpening(buf);
 }

 if (options.denoise) {
   buf = await stepNoiseReduction(buf);
 }

 if (options.resolutionUpscale) {
   buf = await stepResolutionUpscaling(buf, options.maxDimension);
 }

 return sharp(buf).jpeg({ quality: 90, force: true }).toBuffer();
}
