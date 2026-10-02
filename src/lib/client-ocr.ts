// Client-side OCR — updated for tesseract.js v7
import Tesseract from "tesseract.js";

export interface ClientOcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

export interface ClientOcrResult {
  text: string;
  words: ClientOcrWord[];
  confidence: number;
}

export interface OcrProgress {
  status: string;
  progress: number;
}

type ProgressCallback = (progress: OcrProgress) => void;

let worker: Tesseract.Worker | null = null;
let isTerminated = false;
let initPromise: Promise<Tesseract.Worker> | null = null;

export async function initOcrWorker(): Promise<Tesseract.Worker> {
  if (worker && !isTerminated) {
    return worker;
  }
  if (initPromise) {
    return initPromise;
  }

  isTerminated = false;
  initPromise = Tesseract.createWorker("eng", 1, {
    logger: (m: { status: string; progress?: number }) => {
      if (typeof window !== "undefined") {
        const win = window as Window & { _ocrProgress?: OcrProgress };
        win._ocrProgress = {
          status: m.status,
          progress: m.progress ?? 0,
        };
      }
    },
  });

  worker = await initPromise;
  return worker;
}

export async function runClientOcr(
  imageSource: string | File | Blob,
  onProgress?: ProgressCallback
): Promise<ClientOcrResult> {
  const w = await initOcrWorker();

  const progressHandler = onProgress
    ? (m: { status: string; progress?: number }) => {
        onProgress({
          status: m.status,
          progress: m.progress ?? 0,
        });
      }
    : undefined;

  if (progressHandler) {
    const win = window as Window & { _ocrProgress?: OcrProgress };
    const origProgress = win._ocrProgress;
    const wrapped: typeof progressHandler = (m) => {
      progressHandler(m);
    };
    // The logger set in createWorker handles progress; nothing extra needed here.
    void origProgress;
  }

  // tesseract.js v7: need explicit output options for word-level data
  const result = await w.recognize(imageSource, {}, {
    text: true,
    blocks: true,
    hocr: false,
    tsv: false,
  });

  // tesseract.js v7 structure: blocks -> paragraphs -> lines -> words
  const words: ClientOcrWord[] = [];
  for (const block of result.data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const w_data of line.words ?? []) {
          words.push({
            text: w_data.text,
            bbox: {
              x0: w_data.bbox.x0,
              y0: w_data.bbox.y0,
              x1: w_data.bbox.x1,
              y1: w_data.bbox.y1,
            },
            confidence: w_data.confidence,
          });
        }
      }
    }
  }

  return {
    text: result.data.text,
    words,
    confidence: result.data.confidence,
  };
}

export async function terminateOcrWorker() {
  if (worker) {
    await worker.terminate();
    isTerminated = true;
    worker = null;
  }
  initPromise = null;
}

export function isOcrWorkerReady(): boolean {
  return worker !== null && !isTerminated;
}