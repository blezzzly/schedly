/**
 * Standalone smoke test for the OCR pipeline.
 * Runs the full pipeline on a real image without booting Next.js.
 *
 * Usage:
 *   npx tsx src/test/ocr/smoke-test.ts <path-to-image>
 */

import path from "node:path";
import fs from "node:fs/promises";
import { preprocessForOcr } from "../../server/lib/ocr/preprocess";
import { runTesseractOcr } from "../../server/lib/ocr/run-tesseract";
import { parseTimetableFromWords } from "../../server/lib/ocr/parse-words";
import { validateOcrSubjects } from "../../server/lib/ocr/validate";
import type { OcrWord } from "../../lib/ocr";

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("Usage: tsx src/test/ocr/smoke-test.ts <image-path>");
    process.exit(1);
  }

  const absPath = path.resolve(imagePath);
  console.log(`Loading image: ${absPath}`);
  const imageBuffer = await fs.readFile(absPath);
  console.log(`Image size: ${imageBuffer.length} bytes`);

  const t0 = performance.now();
  console.log("\n[1/4] Preprocessing...");
  const preprocessed = await preprocessForOcr(imageBuffer);
  console.log(`  strategy=${preprocessed.strategy} size=${preprocessed.width}x${preprocessed.height} time=${Math.round(performance.now() - t0)}ms`);
  const ocr = await runTesseractOcr({
    source: preprocessed.buffer,
    width: preprocessed.width,
    height: preprocessed.height,
  });
  console.log(`  words=${ocr.words.length} confidence=${Math.round(ocr.confidence)} time=${Math.round(performance.now() - t2)}ms`);
  console.log(`  raw text: ${ocr.text.replace(/\s+/g, " ").slice(0, 200)}`);

  const t2 = performance.now();
  console.log("\n[3/4] Parsing timetable...");
  const parsed = parseTimetableFromWords(
    ocr.words as OcrWord[],
    ocr.lines,
    { pageWidth: ocr.width, pageHeight: ocr.height },
  );
  console.log(`  layout=${parsed.layout} subjects=${parsed.subjects.length} time=${Math.round(performance.now() - t2)}ms`);
  for (const s of parsed.subjects) {
    console.log(`    [${s.days.join(",")}] ${s.startTime}-${s.endTime}  ${s.text}  room=${s.room ?? "(none)"}  conf=${s.confidence.toFixed(2)}`);
  }

  const t3 = performance.now();
  console.log("\n[4/4] Validating...");
  const validated = validateOcrSubjects(parsed.subjects);
  console.log(`  classes=${validated.classes.length} issues=${validated.issues.length} time=${Math.round(performance.now() - t3)}ms`);
  if (validated.issues.length > 0) {
    console.log("  Issues:");
    for (const i of validated.issues) {
      console.log(`    - [${i.type}] ${i.message}`);
    }
  }

  console.log(`\nTotal: ${Math.round(performance.now() - t0)}ms`);
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});