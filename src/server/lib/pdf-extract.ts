/**
 * PDF text extraction using pdfjs-dist v3 (legacy build).
 *
 * Why not pdf-parse?
 *   pdf-parse@2.x bundles pdfjs-dist which expects browser globals like
 *   `DOMMatrix`. On Vercel's Node runtime those globals are not defined, so
 *   the import throws `ReferenceError: DOMMatrix is not defined`.
 *
 * Solution: use pdfjs-dist v3 legacy build via require() — works in Node
 * without browser globals, and text extraction doesn't need canvas/rendering.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjs: any = require("pdfjs-dist/legacy/build/pdf.js");

export interface PdfTextResult {
  text: string;
  numPages: number;
}

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
    useWorkerFetch: false,
    isImageDecoderSupported: false,
  }).promise;

  const numPages = doc.numPages;
  const pages: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: { str?: string }) => item.str ?? "")
      .join(" ");
    pages.push(text);
    page.cleanup();
  }

  await doc.cleanup();
  await doc.destroy();

  return {
    text: pages.join("\n\n").trim(),
    numPages,
  };
}
