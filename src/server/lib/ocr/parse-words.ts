/**
 * Position-based timetable parser.
 *
 * Given a list of OCR words with bounding boxes, this module:
 * 1. Identifies day headers and time slots by content + position heuristics
 * 2. Detects the dominant layout (days-horizontal vs days-vertical)
 * 3. Associates subjects with days/times using spatial proximity
 * 4. Extracts rooms when present in the same cell
 * 5. Assigns a confidence score to each extracted entry
 *
 * No AI/LLM is used — only deterministic rules about layout geometry.
 */

import type {
  DayKey,
  DetectedHeader,
  DetectedSubject,
  OcrWord,
  TimetableLayout,
  ValidationIssue,
} from "./types";
import {
  detectDayFromText,
  detectTimeFromText,
  detectTimeRange,
  detectRoomFromText,
  extractCourseCode,
  isSubjectLikeText,
} from "./detect";

export interface ParseOptions {
  pageWidth: number;
  pageHeight: number;
  xTolerance?: number;
  yTolerance?: number;
}

const DEFAULTS: Required<ParseOptions> = {
  pageWidth: 1000,
  pageHeight: 1000,
  xTolerance: 60,
  yTolerance: 40,
};

export interface ParseResult {
  subjects: DetectedSubject[];
  layout: TimetableLayout;
  dayHeaders: DetectedHeader[];
  timeSlots: DetectedHeader[];
  issues: ValidationIssue[];
  pageWidth: number;
  pageHeight: number;
}

interface PositionedDayToken {
  x: number;
  y: number;
  word: OcrWord;
  match: NonNullable<ReturnType<typeof detectDayFromText>>;
}

interface PositionedTimeToken {
  x: number;
  y: number;
  word: OcrWord;
  match: NonNullable<ReturnType<typeof detectTimeFromText>>;
}

interface DayColumn {
  header: DetectedHeader;
  days: DayKey[];
}

interface TimeSlotMap {
  row: Map<number, string>;
  col: Map<number, string>;
}

interface TimeSlotsResult2 {
  timeColumn: number;
  timeRow: number;
}

export function parseTimetableFromWords(
  words: OcrWord[],
  _lines: unknown[],
  opts: Partial<ParseOptions> = {}
): ParseResult {
  const options = { ...DEFAULTS, ...opts };
  const { pageWidth, pageHeight, xTolerance, yTolerance } = options;

  const issues: ValidationIssue[] = [];

  if (!words || words.length === 0) {
    return {
      subjects: [],
      layout: "unknown",
      dayHeaders: [],
      timeSlots: [],
      issues: [{ type: "ocr_empty", message: "No text detected from OCR" }],
      pageWidth,
      pageHeight,
    };
  }

  // ── Step 1: Detect if this is a row-based table (header row + data rows) ──
  // A row-based table has a top row with column headers (e.g. "Sections", "Subjects",
  // "Days", "Times", "Room") and each data row represents one class.
  const columnTables = tryParseAsColumnTable(words, xTolerance, yTolerance);

  if (columnTables) {
    return finalizeResult(columnTables, "row-table", pageWidth, pageHeight);
  }

  // ── Fallback: legacy parser for non-table layouts (grid timetables) ─────
  return parseLegacyGrid(words, pageWidth, pageHeight, xTolerance, yTolerance, issues);
}

/**
 * Detects "row-table" format: header row at top, each data row = one class.
 * Each row has columns: section, subject, days, times, room.
 *
 * Returns the extracted subjects, or null if this isn't a column-table layout.
 */
function tryParseAsColumnTable(
  words: OcrWord[],
  xTol: number,
  yTol: number,
): DetectedSubject[] | null {
  // Sort by y, then x
  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);

  // Group words into rows by y proximity.
  // Use the MAXIMUM y1 of the previous row's words to determine continuity.
  // This handles tall course-code boxes that extend into the next visual row.
  const rows: OcrWord[][] = [];
  for (const w of sorted) {
    const last = rows[rows.length - 1];
    if (!last) {
      rows.push([w]);
      continue;
    }
    const lastRowBottom = Math.max(...last.map((lw) => lw.bbox.y1));
    // If word starts before or at the bottom of the previous row, merge it
    // This handles tall course-code boxes that extend downward.
    if (w.bbox.y0 <= lastRowBottom) {
      last.push(w);
    } else {
      rows.push([w]);
    }
  }

  if (rows.length < 2) return null;

  // Identify header row: topmost row that has label-like words
  const HEADER_LABELS = /^(sections|subjects?|days?|times?|rooms?)$/i;
  const headerRow = rows[0]!;
  const headerHits = headerRow.filter((w) => HEADER_LABELS.test(w.text.trim())).length;
  if (headerHits < 2) return null;

  // Sort each row by x
  for (const row of rows) row.sort((a, b) => a.bbox.x0 - b.bbox.x0);

  // Identify column x-positions from header row
  const headerCols: Array<{ name: string; x0: number; x1: number }> = [];
  for (const w of headerRow) {
    const t = w.text.trim().toLowerCase();
    if (t === "sections" || t === "section") {
      headerCols.push({ name: "section", x0: w.bbox.x0, x1: w.bbox.x1 });
    } else if (t === "subjects" || t === "subject" || t === "course" || t === "class") {
      headerCols.push({ name: "subject", x0: w.bbox.x0, x1: w.bbox.x1 });
    } else if (t === "days" || t === "day") {
      headerCols.push({ name: "days", x0: w.bbox.x0, x1: w.bbox.x1 });
    } else if (t === "times" || t === "time") {
      headerCols.push({ name: "time", x0: w.bbox.x0, x1: w.bbox.x1 });
    } else if (t === "rooms" || t === "room") {
      headerCols.push({ name: "room", x0: w.bbox.x0, x1: w.bbox.x1 });
    }
  }

  if (headerCols.length < 3) return null;

  // Build column boundaries (use min/max between adjacent column midpoints)
  const sortedCols = headerCols.sort((a, b) => a.x0 - b.x0);
  const colBounds: Array<{ name: string; min: number; max: number }> = [];
  for (let i = 0; i < sortedCols.length; i++) {
    const c = sortedCols[i]!;
    const prev = sortedCols[i - 1];
    const next = sortedCols[i + 1];
    // Use c.x1 (end of header) instead of x0 for the midpoints, so the column
    // boundary lies AFTER the previous header's text ends.
    const min = prev ? (prev.x1 + c.x0) / 2 : -Infinity;
    const max = next ? (c.x1 + next.x0) / 2 : Infinity;
    colBounds.push({ name: c.name, min, max });
  }

  // Extract data rows (skip header)
  const subjects: DetectedSubject[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length === 0) continue;

    // Classify each word by column
    const colWords: Record<string, OcrWord[]> = {};
    for (const c of colBounds) colWords[c.name] = [];
    for (const w of row) {
      for (const c of colBounds) {
        if (w.bbox.x0 >= c.min && w.bbox.x0 < c.max) {
          colWords[c.name]!.push(w);
          break;
        }
      }
    }

    // Build the subject text: section code + subject name (e.g. "GENED01-CS1B Understanding the Self")
    const sectionWords = colWords.section ?? [];
    const subjWords = colWords.subject ?? [];
    const allSubjWords = [...sectionWords, ...subjWords];
    if (allSubjWords.length === 0) continue;
    const subjText = allSubjWords.map((w) => w.text).join(" ").trim();
    if (!subjText) continue;

    // Compute row bbox up front (used for both fallback and final subject)
    const bbox = {
      x0: Math.min(...row.map((w) => w.bbox.x0)),
      y0: Math.min(...row.map((w) => w.bbox.y0)),
      x1: Math.max(...row.map((w) => w.bbox.x1)),
      y1: Math.max(...row.map((w) => w.bbox.y1)),
    };

    // Day(s) — try multiple strategies: direct match, then context fallback
    const days: DayKey[] = [];
    for (const w of colWords.days ?? []) {
      const day = detectDayFromText(w.text);
      if (day) days.push(...day.days);
    }

    // Fallback: if no day found (OCR garbled like "*" or "™"), inherit days
    // from the row immediately above or below that has days detected.
    // This handles OCR errors on the day column without polluting the output
    // with unrelated days (which a global "most common" approach would do).
    if (days.length === 0) {
      const myY = (bbox.y0 + bbox.y1) / 2;
      let bestNeighbor: { days: DayKey[]; dist: number } | null = null;
      for (let j = 0; j < rows.length; j++) {
        if (j === i) continue;
        const otherWords = rows[j]!;
        const otherY = (Math.min(...otherWords.map((w: OcrWord) => w.bbox.y0)) + Math.max(...otherWords.map((w: OcrWord) => w.bbox.y1))) / 2;
        // Find days for this neighbor row
        const otherColDays: OcrWord[] = [];
        for (const w of otherWords) {
          for (const c of colBounds) {
            if (w.bbox.x0 >= c.min && w.bbox.x0 < c.max && c.name === "days") {
              otherColDays.push(w);
              break;
            }
          }
        }
        const otherDays: DayKey[] = [];
        for (const w of otherColDays) {
          const d = detectDayFromText(w.text);
          if (d) otherDays.push(...d.days);
        }
        if (otherDays.length === 0) continue;
        const dist = Math.abs(otherY - myY);
        if (!bestNeighbor || dist < bestNeighbor.dist) {
          bestNeighbor = { days: otherDays, dist };
        }
      }
      if (bestNeighbor) {
        days.push(...bestNeighbor.days);
      }
    }

    // Time range
    const timeWords = colWords.time ?? [];
    let startTime = "";
    let endTime = "";
    if (timeWords.length > 0) {
      const timeText = timeWords.map((w) => w.text).join("");
      const range = detectTimeRange(timeText);
      if (range) {
        startTime = range.start.normalized;
        endTime = range.end.normalized;
      } else {
        const single = detectTimeFromText(timeWords[0]!.text);
        if (single) startTime = single.normalized;
      }
    }

    // Room
    let room: string | null = null;
    for (const w of colWords.room ?? []) {
      const r = detectRoomFromText(w.text);
      if (r) { room = r; break; }
    }

    // Skip header-ish noise
    if (/^(sections|subjects?|days?|times?|rooms?)$/i.test(subjText)) continue;

    // Confidence
    const avgConf = subjWords.reduce((s, w) => s + w.confidence, 0) / subjWords.length / 100;
    const dayConf = days.length > 0 ? 0.9 : 0.3;
    const timeConf = startTime ? 0.85 : 0.3;
    const confidence = Math.max(0.1, Math.min(0.95,
      avgConf * 0.4 + dayConf * 0.3 + timeConf * 0.3
    ));

    const code = extractCourseCode(subjText);

    // If no time but we have a time range text, attempt once more
    if (!startTime && timeWords.length > 0) {
      const joined = timeWords.map((w) => w.text).join(" ");
      const range = detectTimeRange(joined);
      if (range) {
        startTime = range.start.normalized;
        endTime = range.end.normalized;
      }
    }

    // Fallback endTime
    if (startTime && !endTime) endTime = addHour(startTime);

    // Skip header-ish noise
    if (/^(sections|subjects?|days?|times?|rooms?)$/i.test(subjText)) continue;

    subjects.push({
      text: subjText,
      words: row,
      bbox,
      cx: (bbox.x0 + bbox.x1) / 2,
      cy: (bbox.y0 + bbox.y1) / 2,
      confidence,
      code,
      room,
      days,
      startTime,
      endTime,
    });
  }

  return subjects.length > 0 ? subjects : null;
}

function finalizeResult(
  subjects: DetectedSubject[],
  layout: TimetableLayout,
  pageWidth: number,
  pageHeight: number,
): ParseResult {
  // Build issues
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < subjects.length; i++) {
    const s = subjects[i]!;
    if (s.days.length === 0) {
      issues.push({ type: "missing_day", message: `Could not determine day for "${s.text}"`, classIndex: i });
    }
    if (!s.startTime) {
      issues.push({ type: "missing_time", message: `Could not determine time for "${s.text}"`, classIndex: i });
    }
    if (s.confidence < 0.4) {
      issues.push({ type: "low_confidence", message: `Low confidence for "${s.text}"`, classIndex: i });
    }
  }

  return {
    subjects: subjects.sort((a, b) => {
      const dayOrder = (d: DayKey) =>
        ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].indexOf(d);
      const aDay = dayOrder(a.days[0] ?? "monday");
      const bDay = dayOrder(b.days[0] ?? "monday");
      if (aDay !== bDay) return aDay - bDay;
      return a.startTime.localeCompare(b.startTime);
    }),
    layout,
    dayHeaders: [],
    timeSlots: [],
    issues,
    pageWidth,
    pageHeight,
  };
}

/**
 * Legacy grid-parser for traditional timetables (days across, times down or vice-versa).
 * Used as a fallback when the input is NOT a column-table layout.
 */
function parseLegacyGrid(
  words: OcrWord[],
  pageWidth: number,
  pageHeight: number,
  xTolerance: number,
  yTolerance: number,
  issues: ValidationIssue[],
): ParseResult {
  // ── Step 1: Categorize all words ─────────────────────────────────────
  const dayTokens: PositionedDayToken[] = [];
  const timeTokens: PositionedTimeToken[] = [];
  const subjectTokens: OcrWord[] = [];

  for (const word of words) {
    const t = word.text.trim();
    const day = detectDayFromText(t);
    if (day) {
      dayTokens.push({ x: word.bbox.x0, y: word.bbox.y0, word, match: day });
      continue;
    }
    const time = detectTimeFromText(t);
    if (time) {
      timeTokens.push({ x: word.bbox.x0, y: word.bbox.y0, word, match: time });
      continue;
    }
    if (isSubjectLikeText(t)) {
      subjectTokens.push(word);
    }
  }

  const dayColumns = detectDayColumns(dayTokens, xTolerance, yTolerance);
  const timeSlots = detectTimeSlots(timeTokens, xTolerance, yTolerance);

  const layout = detectLayout(
    dayTokens,
    timeTokens,
    timeSlots,
    pageWidth,
    pageHeight,
    dayColumns.length,
  );

  const timeMap = buildTimeMap(timeTokens, timeSlots, layout, xTolerance, yTolerance);
  const subjectClusters = groupSubjectClusters(subjectTokens, xTolerance, yTolerance);

  const extractedSubjects: DetectedSubject[] = [];
  for (const cluster of subjectClusters) {
    const text = cluster.words.map((w) => w.text).join(" ");
    if (!text.trim()) continue;

    const code = extractCourseCode(text);
    const avgConf = cluster.words.reduce((s, w) => s + w.confidence, 0) / cluster.words.length;

    const subjectX = center(cluster.bbox.x0, cluster.bbox.x1);
    const subjectY = center(cluster.bbox.y0, cluster.bbox.y1);

    let closestDay: DayColumn | null = null;
    let closestDayDist = Infinity;
    for (const col of dayColumns) {
      const dist = Math.abs(col.header.cx - subjectX);
      if (dist < closestDayDist) {
        closestDayDist = dist;
        closestDay = col;
      }
    }

    let assignedTime = "";
    if (layout === "days-vertical") {
      const rowKey = roundToBucket(subjectY, yTolerance);
      const candidates = [...timeMap.row.entries()].sort(
        (a, b) => Math.abs(a[0] - rowKey) - Math.abs(b[0] - rowKey)
      );
      assignedTime = candidates[0]?.[1] ?? "";
    } else {
      const colKey = roundToBucket(subjectX, xTolerance);
      const candidates = [...timeMap.col.entries()].sort(
        (a, b) => Math.abs(a[0] - colKey) - Math.abs(b[0] - colKey)
      );
      assignedTime = candidates[0]?.[1] ?? "";
    }

    let room: string | null = null;
    const nearbyWords = words.filter(
      (w) =>
        Math.abs(w.bbox.x0 - cluster.bbox.x0) < 300 &&
        Math.abs(w.bbox.y0 - cluster.bbox.y0) < 60
    );
    for (const w of nearbyWords) {
      const r = detectRoomFromText(w.text);
      if (r) { room = r; break; }
    }

    const dayConf = closestDay ? 0.9 : 0.3;
    const timeConf = assignedTime ? 0.85 : 0.3;
    const roomConf = room ? 0.8 : 0.5;
    const ocrConf = avgConf / 100;
    const confidence = Math.max(0.1, Math.min(0.95,
      ocrConf * 0.4 + dayConf * 0.3 + timeConf * 0.2 + roomConf * 0.1
    ));

    const endTime = assignedTime ? addHour(assignedTime) : "";

    extractedSubjects.push({
      text,
      words: cluster.words,
      bbox: cluster.bbox,
      cx: subjectX,
      cy: subjectY,
      confidence,
      code,
      room,
      days: closestDay?.days ?? [],
      startTime: assignedTime,
      endTime,
    });
  }

  // Deduplicate
  const seen = new Map<string, DetectedSubject>();
  for (const s of extractedSubjects) {
    const key = `${s.text.toLowerCase()}|${s.days.join(",")}|${s.startTime}`;
    const existing = seen.get(key);
    if (!existing || s.confidence > existing.confidence) seen.set(key, s);
  }

  const deduped = [...seen.values()];
  for (let i = 0; i < deduped.length; i++) {
    const s = deduped[i]!;
    if (s.days.length === 0) {
      issues.push({ type: "missing_day", message: `Could not determine day for "${s.text}"`, classIndex: i });
    }
    if (!s.startTime) {
      issues.push({ type: "missing_time", message: `Could not determine time for "${s.text}"`, classIndex: i });
    }
    if (s.confidence < 0.4) {
      issues.push({ type: "low_confidence", message: `Low confidence for "${s.text}"`, classIndex: i });
    }
  }

  return {
    subjects: deduped.sort((a, b) => {
      const dayOrder = (d: DayKey) =>
        ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].indexOf(d);
      const aDay = dayOrder(a.days[0] ?? "monday");
      const bDay = dayOrder(b.days[0] ?? "monday");
      if (aDay !== bDay) return aDay - bDay;
      return a.startTime.localeCompare(b.startTime);
    }),
    layout,
    dayHeaders: dayColumns.map((c) => c.header),
    timeSlots: [],
    issues,
    pageWidth,
    pageHeight,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function center(x0: number, x1: number): number {
  return (x0 + x1) / 2;
}

function roundToBucket(value: number, tolerance: number): number {
  return Math.round(value / tolerance) * tolerance;
}

function addHour(time24: string): string {
  const parts = time24.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const total = h * 60 + m + 60;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function detectDayColumns(
  dayTokens: PositionedDayToken[],
  xTol: number,
  yTol: number,
): DayColumn[] {
  if (dayTokens.length === 0) return [];

  // Find the row with the most day tokens (header row)
  const yCounts = new Map<number, number>();
  for (const dt of dayTokens) {
    const bucket = roundToBucket(dt.y, yTol);
    yCounts.set(bucket, (yCounts.get(bucket) ?? 0) + 1);
  }
  let headerY = -1;
  let headerCount = 0;
  for (const [y, c] of yCounts.entries()) {
    if (c > headerCount) {
      headerCount = c;
      headerY = y;
    }
  }
  if (headerCount < 3 && dayTokens.length < 3) {
    // No clear header row — treat each unique x as its own column
    return dedupByX(dayTokens);
  }

  // Pick days on/near header row
  const header = dayTokens.filter((d) => Math.abs(d.y - headerY) < yTol * 2);

  // Group by x
  const xBuckets = new Map<number, PositionedDayToken>();
  for (const d of header) {
    const bucket = roundToBucket(d.x, xTol);
    if (!xBuckets.has(bucket)) xBuckets.set(bucket, d);
  }

  return [...xBuckets.values()]
    .sort((a, b) => a.x - b.x)
    .map((d) => ({
      header: {
        kind: "day" as const,
        text: d.match.matchedText,
        value: d.match.days.join(","),
        bbox: d.word.bbox,
        confidence: d.match.certainty * (d.word.confidence / 100),
        cx: center(d.word.bbox.x0, d.word.bbox.x1),
        cy: center(d.word.bbox.y0, d.word.bbox.y1),
      },
      days: d.match.days,
    }));
}

function dedupByX(dayTokens: PositionedDayToken[]): DayColumn[] {
  const seen = new Map<number, PositionedDayToken>();
  for (const d of dayTokens) {
    if (!seen.has(d.x)) seen.set(d.x, d);
  }
  return [...seen.values()].map((d) => ({
    header: {
      kind: "day" as const,
      text: d.match.matchedText,
      value: d.match.days.join(","),
      bbox: d.word.bbox,
      confidence: d.match.certainty * (d.word.confidence / 100),
      cx: center(d.word.bbox.x0, d.word.bbox.x1),
      cy: center(d.word.bbox.y0, d.word.bbox.y1),
    },
    days: d.match.days,
  }));
}

function detectLayout(
  dayTokens: PositionedDayToken[],
  timeTokens: PositionedTimeToken[],
  slots: TimeSlotsResult2,
  pageWidth: number,
  pageHeight: number,
  dayColCount: number,
): TimetableLayout {
  const timeLeftRatio = slots.timeColumn >= 0 ? slots.timeColumn / pageWidth : 1;
  const timeTopRatio = slots.timeRow >= 0 ? slots.timeRow / pageHeight : 1;

  // 1. Are days clustered in a tight horizontal band?
  const dayYSpread = spread(dayTokens.map((d) => d.y));
  const dayXSpread = spread(dayTokens.map((d) => d.x));
  const daysHorizontalBand = dayYSpread < pageHeight * 0.15;
  const daysVerticalBand = dayXSpread < pageWidth * 0.15 && dayTokens.length > 1;

  // 2. Are times clustered in a tight vertical column on the left?
  const timesOnLeft = slots.timeColumn >= 0 && timeLeftRatio < 0.3 && colCountOf(timeTokens.map((t) => roundToBucket(t.x, 30))) > 0;
  // 3. Are times clustered in a tight horizontal row near the top?
  const timesOnTop = slots.timeRow >= 0 && timeTopRatio < 0.25;

  // Strongest signals first:
  // - Days horizontal + time column on the left → days-horizontal
  // - Days vertical + time row on top → days-vertical
  if (daysHorizontalBand && dayTokens.length >= 2) {
    if (timesOnLeft) return "days-horizontal";
    return "days-horizontal";
  }
  if (daysVerticalBand && dayTokens.length >= 2) {
    if (timesOnTop) return "days-vertical";
    return "days-vertical";
  }

  // Fallback heuristics
  if (timesOnLeft) return "days-horizontal";
  if (timesOnTop) return "days-vertical";
  if (dayColCount >= 3) return "days-horizontal";

  return "mixed";
}

function spread(values: number[]): number {
  if (values.length === 0) return 0;
  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

function colCountOf(values: number[]): number {
  return new Set(values).size;
}

function detectTimeSlots(
  timeTokens: PositionedTimeToken[],
  xTol: number,
  yTol: number,
): TimeSlotsResult2 {
  // Most common x = likely time column
  const xCounts = new Map<number, number>();
  for (const t of timeTokens) {
    const b = roundToBucket(t.x, xTol);
    xCounts.set(b, (xCounts.get(b) ?? 0) + 1);
  }
  let timeColumn = -1;
  let colCount = 0;
  for (const [x, c] of xCounts.entries()) {
    if (c > colCount) {
      colCount = c;
      timeColumn = x;
    }
  }

  // Most common y = likely time row
  const yCounts = new Map<number, number>();
  for (const t of timeTokens) {
    const b = roundToBucket(t.y, yTol);
    yCounts.set(b, (yCounts.get(b) ?? 0) + 1);
  }
  let timeRow = -1;
  let rowCount = 0;
  for (const [y, c] of yCounts.entries()) {
    if (c > rowCount) {
      rowCount = c;
      timeRow = y;
    }
  }

  return { timeColumn, timeRow };
}

function buildTimeMap(
  timeTokens: PositionedTimeToken[],
  slots: TimeSlotsResult2,
  layout: TimetableLayout,
  xTol: number,
  yTol: number,
): TimeSlotMap {
  const row = new Map<number, string>();
  const col = new Map<number, string>();

  // For "days-vertical" the times are typically on the left column.
  // For "days-horizontal" the times are typically on the top row.
  // For "mixed" we capture everything.
  if (layout === "days-vertical" && slots.timeColumn >= 0) {
    for (const t of timeTokens) {
      if (Math.abs(t.x - slots.timeColumn) < xTol * 3) {
        const k = roundToBucket(t.y, yTol);
        if (!row.has(k)) row.set(k, t.match.normalized);
      }
    }
  } else if (layout === "days-horizontal" && slots.timeRow >= 0) {
    for (const t of timeTokens) {
      if (Math.abs(t.y - slots.timeRow) < yTol * 2) {
        const k = roundToBucket(t.x, xTol);
        if (!col.has(k)) col.set(k, t.match.normalized);
      }
    }
  } else {
    // Mixed: capture both
    for (const t of timeTokens) {
      const kr = roundToBucket(t.y, yTol);
      const kc = roundToBucket(t.x, xTol);
      if (!row.has(kr)) row.set(kr, t.match.normalized);
      if (!col.has(kc)) col.set(kc, t.match.normalized);
    }
  }

  return { row, col };
}

interface Cluster {
  words: OcrWord[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

function groupSubjectClusters(
  words: OcrWord[],
  xTol: number,
  yTol: number,
): Cluster[] {
  if (words.length === 0) return [];

  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const clusters: Cluster[] = [];

  for (const word of sorted) {
    const last = clusters[clusters.length - 1];
    const sameRow = last && Math.abs(word.bbox.y0 - last.bbox.y0) < yTol;
    const adjacentX = sameRow && word.bbox.x0 - last.bbox.x1 < xTol * 1.5;

    if (sameRow && adjacentX) {
      last.words.push(word);
      last.bbox.x0 = Math.min(last.bbox.x0, word.bbox.x0);
      last.bbox.y0 = Math.min(last.bbox.y0, word.bbox.y0);
      last.bbox.x1 = Math.max(last.bbox.x1, word.bbox.x1);
      last.bbox.y1 = Math.max(last.bbox.y1, word.bbox.y1);
    } else {
      clusters.push({
        words: [word],
        bbox: { x0: word.bbox.x0, y0: word.bbox.y0, x1: word.bbox.x1, y1: word.bbox.y1 },
      });
    }
  }

  return clusters;
}