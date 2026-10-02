/**
 * Tesseract.js worker warmup to eliminate cold start latency.
 *
 * First-time tesseract.js initialization downloads ~10MB of WASM files and
 * language data, which can take 10-30 seconds on a fresh serverless function.
 * Calling warmupOcr() once during upload kicks off the init in parallel with
 * the storage step so the actual OCR run is much faster.
 *
 * Safe to call multiple times — uses an in-process promise cache.
 */

import { runOcr } from "@/lib/ocr";

let warmupPromise: Promise<void> | null = null;
let lastWarmupAt = 0;
const WARMUP_TTL_MS = 10 * 60 * 1000;

export async function warmupOcr(): Promise<void> {
  const now = Date.now();
  if (warmupPromise && now - lastWarmupAt < WARMUP_TTL_MS) {
    return warmupPromise;
  }

  warmupPromise = (async () => {
    try {
      // Create a tiny blank PNG buffer to feed into tesseract.
      // This forces it to load the WASM core and English language data
      // without doing any real OCR work.
      const tinyPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64",
      );
      await runOcr(tinyPng);
      lastWarmupAt = Date.now();
      console.log("[OCR_WARMUP] Tesseract worker ready");
    } catch (err) {
      console.error("[OCR_WARMUP] Failed:", err);
      warmupPromise = null;
      throw err;
    }
  })();

  return warmupPromise;
}

export function isOcrWarm(): boolean {
  return warmupPromise !== null && Date.now() - lastWarmupAt < WARMUP_TTL_MS;
}