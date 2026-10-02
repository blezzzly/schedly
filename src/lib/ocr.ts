import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";

export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

export interface OcrLine {
  text: string;
  words: OcrWord[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

export interface OcrBlock {
  lines: OcrLine[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
  lines: OcrLine[];
  blocks: OcrBlock[];
  confidence: number;
}

const WORKER_LANG = "eng";
const WORKER_OEM = 1;
// PSM 6 = "Assume a single uniform block of text" — works well for tabular schedules
const WORKER_PSM = 6;

let workerPromise: Promise<Worker> | null = null;

/**
 * Resolves tesseract.js's bundled worker/core/lang paths from the local
 * node_modules folder. Importing tesseract.js inside Next.js dev sometimes
 * corrupts `import.meta.url` (resolves to `C:\ROOT\...`), so we always look
 * up the package explicitly via `process.cwd()`.
 */
function getTesseractPaths() {
  const projectRoot = process.cwd();
  const tessDir = path.join(projectRoot, "node_modules", "tesseract.js");
  return {
    workerPath: path.join(tessDir, "src", "worker-script", "node", "index.js"),
    corePath: path.join(tessDir, "src", "worker-script", "node", "getCore.js"),
    langPath: path.join(tessDir, "lang-data"),
  };
}

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    const paths = getTesseractPaths();
    const isDev = process.env.NODE_ENV === "development";
    workerPromise = createWorker(WORKER_LANG, WORKER_OEM, {
      workerPath: paths.workerPath,
      workerBlobURL: false,
      errorHandler: (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[OCR] Worker error: ${msg}`, err);
      },
      // Always pass a real function — tesseract.js v5 calls logger() even when undefined,
      // which throws "logger is not a function" in the worker thread.
      logger: isDev
        ? (m: { status: string; progress?: number }) => {
            if (m.status === "recognizing text") {
              console.log(`[OCR] Progress: ${Math.round((m.progress ?? 0) * 100)}%`);
            }
          }
        : () => {},
    });
  }
  return workerPromise;
}

export async function runOcr(imageSource: string | Blob | Buffer): Promise<OcrResult> {
  const worker = await getWorker();

  // tesseract.js v7 needs explicit output options to populate hocr/blocks/words.
  // Without these, only `text` and `confidence` are returned.
  const { data } = await worker.recognize(imageSource, {}, {
    text: true,
    blocks: true,
    hocr: true,
    tsv: true,
  });

  // tesseract.js v7 structure: blocks -> paragraphs -> lines -> words
  // Fall back to empty arrays when missing so callers don't crash.
  type WordLike = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
  type LineLike = {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    words?: WordLike[];
  };
  type ParagraphLike = { lines?: LineLike[] };
  type BlockLike = { bbox: { x0: number; y0: number; x1: number; y1: number }; paragraphs?: ParagraphLike[] };

  const blocksRaw = (data.blocks ?? []) as BlockLike[];
  const lines: OcrLine[] = [];
  const words: OcrWord[] = [];
  const blocks: OcrBlock[] = [];

  for (const block of blocksRaw) {
    const blockLines: OcrLine[] = [];
    const paragraphs = block.paragraphs ?? [];
    for (const para of paragraphs) {
      const paraLines = para.lines ?? [];
      for (const line of paraLines) {
        const lineWords: OcrWord[] = [];
        for (const w of line.words ?? []) {
          const word: OcrWord = {
            text: w.text,
            bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
            confidence: w.confidence,
          };
          lineWords.push(word);
          words.push(word);
        }
        const ocrLine: OcrLine = {
          text: line.text,
          words: lineWords,
          bbox: { x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 },
          confidence: line.confidence,
        };
        lineWords.length = lineWords.length;
        blockLines.push(ocrLine);
        lines.push(ocrLine);
      }
    }
    blocks.push({
      lines: blockLines,
      bbox: { x0: block.bbox.x0, y0: block.bbox.y0, x1: block.bbox.x1, y1: block.bbox.y1 },
    });
  }

  return {
    text: data.text,
    words,
    lines,
    blocks,
    confidence: data.confidence,
  };
}

export async function terminateWorker() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
