/**
 * Shared TypeScript types for the OCR-based timetable extraction pipeline.
 *
 * Mirrors the `tesseract.js` word shape (x0, y0, x1, y1 in pixel coordinates)
 * plus a few higher-level concepts (cells, headers) used by the position-based
 * parser. All coordinates are in the *preprocessed* image's coordinate space —
 * the same space the OCR worker emitted. Keeping a single coordinate system
 * avoids subtle bugs when matching day/time headers to subjects.
 */

export interface OcrBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  bbox: OcrBbox;
  confidence: number;
}

export interface OcrLine {
  text: string;
  bbox: OcrBbox;
  confidence: number;
  words: OcrWord[];
}

export interface OcrPage {
  text: string;
  words: OcrWord[];
  lines: OcrLine[];
  /** Width/height of the source image the OCR was run on. */
  width: number;
  height: number;
  confidence: number;
}

export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const DAY_KEYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export interface DetectedHeader {
  kind: "day" | "time";
  text: string;
  value: string;
  bbox: OcrBbox;
  confidence: number;
  /** Center x — used for column alignment. */
  cx: number;
  /** Center y — used for row alignment. */
  cy: number;
}

export interface DetectedSubject {
  text: string;
  words: OcrWord[];
  bbox: OcrBbox;
  cx: number;
  cy: number;
  confidence: number;
  /** Best-guess course code extracted from the subject text (e.g. "CCS 101"). */
  code: string | null;
  /** Normalized room value (null when no room found). */
  room: string | null;
  /** Day(s) the subject belongs to (resolved by position). */
  days: DayKey[];
  /** Resolved start/end in 24h "HH:MM". */
  startTime: string;
  endTime: string;
}

export type TimetableLayout = "days-horizontal" | "days-vertical" | "mixed" | "row-table" | "unknown";

export interface ValidationIssue {
  type:
    | "missing_subject"
    | "missing_day"
    | "missing_time"
    | "invalid_time"
    | "invalid_room"
    | "low_confidence"
    | "duplicate"
    | "ocr_empty";
  message: string;
  classIndex?: number;
}

export interface OcrTimetableResult {
  classes: Array<{
    subject: string;
    code: string | null;
    room: string | null;
    instructor: string | null;
    days: DayKey[];
    startTime: string;
    endTime: string;
    confidence: number;
  }>;
  metadata: {
    totalClasses: number;
    confidence: number;
    layout: TimetableLayout;
    notes: string | null;
    issues: ValidationIssue[];
    ocrConfidence: number;
    imageWidth: number;
    imageHeight: number;
  };
}