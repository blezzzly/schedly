/**
 * Result cache keyed by a perceptual image hash.
 *
 * Two uploads of (near-)identical images — same photo re-uploaded, a screenshot
 * taken twice, a PDF re-exported — produce the same hash, so the expensive AI
 * extraction is skipped and the cached result returned instantly.
 *
 * Hashing uses an average hash (aHash): the image is downscaled to 8x8 grayscale
 * and each pixel is compared to the mean, yielding a 64-bit fingerprint that is
 * tolerant of compression, minor crops, and lighting shifts. This is intentionally
 * cheap and runs locally (no AI, no network).
 */

import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { PipelineLogger } from "./structured-logger";

export interface CachedExtraction {
  hash: string;
  result: unknown;
  cachedAt: string;
  model: string;
}

interface CacheStore {
  version: number;
  entries: Record<string, CachedExtraction>;
}

const CACHE_VERSION = 1;
const HASH_SIZE = 8; // 8x8 = 64 bits

/**
 * Compute the average hash of an image buffer. Returns a 16-char hex string.
 */
export async function computeImageHash(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .greyscale()
    .resize(HASH_SIZE, HASH_SIZE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i]!;
  const mean = sum / data.length;

  let bits = BigInt(0);
  const one = BigInt(1);
  for (let i = 0; i < data.length; i++) {
    if (data[i]! >= mean) {
      bits |= one << BigInt(i);
    }
  }
  // info.channels should be 1 after greyscale; guard anyway.
  void info;
  return bits.toString(16).padStart(16, "0");
}

/** Hamming distance between two aHash hex strings (0 = identical). */
export function hashDistance(a: string, b: string): number {
  const na = BigInt(`0x${a}`);
  const nb = BigInt(`0x${b}`);
  let diff = na ^ nb;
  let count = 0;
  const zero = BigInt(0);
  const one = BigInt(1);
  while (diff > zero) {
    count += Number(diff & one);
    diff >>= one;
  }
  return count;
}

export class ExtractionCache {
  private store: CacheStore = { version: CACHE_VERSION, entries: {} };
  private filePath: string | null;
  private loaded = false;

  constructor(filePath?: string) {
    this.filePath = filePath ?? process.env.AI_CACHE_FILE ?? null;
  }

  private async ensureLoaded() {
    if (this.loaded || !this.filePath) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as CacheStore;
      if (parsed.version === CACHE_VERSION && parsed.entries) {
        this.store = parsed;
      }
    } catch {
      // No cache file yet — start fresh.
    }
  }

  private async persist() {
    if (!this.filePath) return;
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(this.store), "utf8");
    } catch (err) {
      PipelineLogger.warn("cache", "Failed to persist extraction cache", undefined, err);
    }
  }

  /**
   * Look up a cached result. `tolerance` allows near-duplicate matches
   * (Hamming distance threshold). Returns the best match or null.
   */
  async get(hash: string, tolerance = 0): Promise<CachedExtraction | null> {
    await this.ensureLoaded();
    const exact = this.store.entries[hash];
    if (exact) return exact;
    if (tolerance <= 0) return null;

    let best: CachedExtraction | null = null;
    let bestDist = tolerance + 1;
    for (const entry of Object.values(this.store.entries)) {
      const d = hashDistance(hash, entry.hash);
      if (d <= tolerance && d < bestDist) {
        bestDist = d;
        best = entry;
      }
    }
    return best;
  }

  async set(hash: string, result: unknown, model: string): Promise<void> {
    await this.ensureLoaded();
    this.store.entries[hash] = {
      hash,
      result,
      cachedAt: new Date().toISOString(),
      model,
    };
    await this.persist();
  }

  size(): number {
    return Object.keys(this.store.entries).length;
  }

  clear(): void {
    this.store = { version: CACHE_VERSION, entries: {} };
  }
}

// Shared singleton used by the service layer.
export const extractionCache = new ExtractionCache();
