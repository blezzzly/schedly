import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { DATASET, generateFixturePng, generateVariantPng } from "./dataset";
import { runBenchmark, saveBaseline } from "./runner";
import { computeImageHash, hashDistance, ExtractionCache } from "@/server/lib/image-cache";

const BENCH_DIR = path.resolve(process.cwd(), "benchmark");
const FIXTURE_DIR = path.join(BENCH_DIR, "fixtures");

async function writeAllFixtures() {
  await fs.mkdir(FIXTURE_DIR, { recursive: true });
  for (const s of DATASET) {
    const png = await generateFixturePng(s);
    await fs.writeFile(path.join(FIXTURE_DIR, `${s.id}.png`), png);
    const variant = await generateVariantPng(s);
    await fs.writeFile(path.join(FIXTURE_DIR, `${s.id}.variant.png`), variant);
  }
}

describe("AI extraction benchmark", () => {
  beforeAll(async () => {
    await writeAllFixtures();
  }, 30_000);

  it("runs the full dataset and writes a report + baseline", async () => {
    // Establish/refresh the baseline on first run so the suite is self-seeding.
    const baselineExists = await fs
      .access(path.join(BENCH_DIR, "baseline.json"))
      .then(() => true)
      .catch(() => false);
    if (!baselineExists) {
      await saveBaseline();
    }

    const { report } = await runBenchmark({ write: true, enforceBaseline: false });

    expect(report.scenarios).toBe(DATASET.length);
    // The deterministic pipeline must achieve strong field accuracy on this
    // offline dataset (day/room/time normalization + de-duplication).
    expect(report.averageAccuracy).toBeGreaterThan(0.9);
    expect(report.fieldAccuracies.days).toBeGreaterThan(0.9);
    expect(report.fieldAccuracies.startTime).toBeGreaterThan(0.9);
    expect(report.fieldAccuracies.room).toBeGreaterThan(0.9);

    // Fixtures were materialized.
    for (const s of DATASET) {
      const p = path.join(FIXTURE_DIR, `${s.id}.png`);
      const stat = await fs.stat(p);
      expect(stat.size).toBeGreaterThan(0);
    }

    // Regression: TF -> Tue+Fri, and a Thu class must not falsely overlap.
    const tf = report.perScenario.find((s) => s.id === "tf-day-bug-regression");
    expect(tf?.hasConflicts).toBe(false);
  }, 60_000);

  it("de-duplicates merged-cell / noisy OCR rows to match ground truth counts", async () => {
    const { report } = await runBenchmark({ write: false });
    const merged = report.perScenario.find((s) => s.id === "merged-cells");
    const noisy = report.perScenario.find((s) => s.id === "noise-duplicate-ocr");
    expect(merged?.extractedCount).toBe(merged?.expectedCount);
    expect(noisy?.extractedCount).toBe(noisy?.expectedCount);
  });

  it("reports a usable latency figure per scenario", async () => {
    const { report } = await runBenchmark({ write: false });
    for (const s of report.perScenario) {
      expect(s.ms).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(s.ms)).toBe(true);
    }
  });
});

describe("image-hash cache", () => {
  it("produces identical hashes for a fixture and its near-duplicate variant", async () => {
    const s = DATASET[0]!;
    const base = await generateFixturePng(s);
    const variant = await generateVariantPng(s);
    const h1 = await computeImageHash(base);
    const h2 = await computeImageHash(variant);
    expect(h1).toBe(h2);
    expect(hashDistance(h1, h2)).toBe(0);
  });

  it("stores and retrieves a cached result by hash (skips AI)", async () => {
    const s = DATASET[0]!;
    const buf = await generateFixturePng(s);
    const hash = await computeImageHash(buf);

    const cache = new ExtractionCache();
    cache.clear();
    expect(await cache.get(hash)).toBeNull();

    const fakeResult = { semester: null, classes: [], metadata: { totalClasses: 0, confidence: 1 } };
    await cache.set(hash, fakeResult, "gemma-4-26b");
    const hit = await cache.get(hash);
    expect(hit).not.toBeNull();
    expect(hit?.model).toBe("gemma-4-26b");
    expect(hit?.result).toEqual(fakeResult);
  });

  it("tolerates near-duplicates within a Hamming distance threshold", async () => {
    const a = "ffffffffffffffff";
    const b = "fffffffffffffffe"; // 1 bit differs
    expect(hashDistance(a, b)).toBe(1);
    const cache = new ExtractionCache();
    cache.clear();
    await cache.set(a, { ok: true }, "m");
    const hit = await cache.get(b, 1);
    expect(hit).not.toBeNull();
    const miss = await cache.get(b, 0);
    expect(miss).toBeNull();
  });
});
