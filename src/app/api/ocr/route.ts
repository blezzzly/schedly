import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { parseTimetable, validateParsedResult, type TimetableWord } from "@/server/lib/timetable-parser";
import { extractionCache, computeImageHash } from "@/server/lib/image-cache";

export const maxDuration = 60;

interface OcrWordInput {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

interface ParseRequestBody {
  words: OcrWordInput[];
  pageWidth?: number;
  pageHeight?: number;
  imageHash?: string;
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: ParseRequestBody = await request.json();
    const { words, pageWidth, pageHeight, imageHash } = body;

    if (!Array.isArray(words) || words.length === 0) {
      return NextResponse.json(
        { error: "No OCR words provided" },
        { status: 400 }
      );
    }

    const wordsForCache = imageHash
      ? await extractionCache.get(imageHash)
      : null;
    if (wordsForCache && typeof wordsForCache === "object" && "classes" in wordsForCache) {
      return NextResponse.json(wordsForCache);
    }

    const timetableWords: TimetableWord[] = words.map((w) => ({
      text: w.text,
      bbox: {
        x0: w.bbox.x0,
        y0: w.bbox.y0,
        x1: w.bbox.x1,
        y1: w.bbox.y1,
      },
      confidence: w.confidence,
    }));

    const rawResult = parseTimetable(timetableWords, { pageWidth, pageHeight });
    const result = validateParsedResult(rawResult);

    if (imageHash && result.classes.length > 0) {
      try {
        await extractionCache.set(imageHash, result, "ocr-parser");
      } catch {
        // Cache failures are non-fatal
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[OCR_PARSE_API] Error:", err);
    return NextResponse.json(
      { error: "Failed to parse timetable. Please try again." },
      { status: 500 }
    );
  }
}
