import { normalizeDays, type DayKey } from "./day-normalizer";

export interface TimetableWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

export interface TimetableLine {
  text: string;
  words: TimetableWord[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface ParsedClass {
  subject: string;
  code: string | null;
  room: string | null;
  instructor: string | null;
  days: DayKey[];
  startTime: string;
  endTime: string;
  section: string | null;
  block: string | null;
  notes: string | null;
  confidence: number;
  originalDays: string[];
  originalStartTime: string;
  originalEndTime: string;
}

export interface ParserResult {
  classes: ParsedClass[];
  metadata: {
    totalClasses: number;
    confidence: number;
    layout: string;
    notes: string | null;
    issues: Array<{ type: string; message: string; classIndex?: number }>;
  };
}

const DAY_CODES: Record<string, DayKey> = {
  M: "monday", MON: "monday", MONDAY: "monday", MOND: "monday",
  T: "tuesday", TUE: "tuesday", TU: "tuesday", TUES: "tuesday", TUESDAY: "tuesday",
  W: "wednesday", WED: "wednesday", WEDS: "wednesday", WEDNESDAY: "wednesday",
  TH: "thursday", THU: "thursday", THUR: "thursday", THURS: "thursday", THURSDAY: "thursday",
  F: "friday", FRI: "friday", FRIDAY: "friday",
  SAT: "saturday", SATU: "saturday", SATURDAY: "saturday",
  SUN: "sunday", SUNH: "sunday", SUNDA: "sunday", SUNDAY: "sunday",
};

const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?:\s*(am|pm|AM|PM))?$/;
const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeTime(raw: string): string {
  const s = raw.trim();
  if (TIME_24H.test(s)) return s;
  
  const m = s.match(TIME_PATTERN);
  if (m) {
    let h = parseInt(m[1]!, 10);
    const min = m[2]!;
    const mer = m[3]?.toLowerCase();
    if (Number.isNaN(h) || h < 0 || h > 23) return s;
    if (mer === "pm" && h !== 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${min}`;
  }
  
  const simple = s.match(/^(\d{2})(\d{2})$/);
  if (simple) {
    const h = parseInt(simple[1]!, 10);
    const min = simple[2]!;
    if (h <= 23 && parseInt(min, 10) <= 59) {
      return `${String(h).padStart(2, "0")}:${min}`;
    }
  }
  
  return s;
}

function isTimeText(text: string): boolean {
  const t = text.trim().toLowerCase();
  return TIME_PATTERN.test(t) || TIME_24H.test(t) ||
    /^\d{4}$/.test(t) || /^\d{2}:\d{2}[ap]?m?$/i.test(t);
}

function isDayText(text: string): boolean {
  const t = text.trim().toUpperCase();
  return t in DAY_CODES || /^(MWF|MTW|TTH|TF|MW|TTHS?|MWTH|MTH|WTF|TFU|SATSU|SATH|SUNTH)$/i.test(t);
}

function isSubjectLikeText(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 2) return false;
  if (isTimeText(t)) return false;
  if (isDayText(t)) return false;
  if (/^(room|rm|r\.?|lab|class|course|noon|lunch|break|am|pm|to)$/i.test(t)) return false;
  if (/^\d{3,4}$/.test(t)) return true;
  if (/^[A-Z]{2,6}\s*\d{2,4}$/i.test(t)) return true;
  if (/^[A-Z]{2,6}\s*[A-Z]+\s*\d*$/i.test(t)) return true;
  if (/\d/.test(t) && t.length >= 4) return true;
  return false;
}

function isRoomText(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(room|rm|r\.?|lab|comlab|auditorium|hall)$/.test(t) ||
    /^r?\s*\d{2,4}[a-z]?$/i.test(t) ||
    /^(lab|comlab|aud)[- ]?\d+$/i.test(t);
}

function extractCourseCode(text: string): string | null {
  const m = text.match(/^([A-Z]{2,6})\s*(\d{2,4})$/i);
  if (m) return `${m[1]!.toUpperCase()} ${m[2]}`;
  const m2 = text.match(/^([A-Z]{2,6})\s*(\d+)\s*-\s*(\d+)$/i);
  if (m2) return `${m2[1]!.toUpperCase()} ${m2[2]}-${m2[3]}`;
  return null;
}

interface DetectedHeader {
  type: "day" | "time";
  text: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CellContent {
  text: string;
  words: TimetableWord[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export function parseTimetable(
  words: TimetableWord[],
  options?: {
    pageWidth?: number;
    pageHeight?: number;
    detectLayout?: boolean;
  }
): ParserResult {
  const issues: Array<{ type: string; message: string; classIndex?: number }> = [];
  
  if (!words || words.length === 0) {
    return {
      classes: [],
      metadata: { totalClasses: 0, confidence: 0, layout: "unknown", notes: "No text detected", issues: [] },
    };
  }
  
  const allWords = words;
  
  const pageWidth = options?.pageWidth ?? Math.max(...allWords.map(w => w.bbox.x1), 1000);
  const pageHeight = options?.pageHeight ?? Math.max(...allWords.map(w => w.bbox.y1), 1000);
  
  const sortedByY = [...allWords].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const sortedByX = [...allWords].sort((a, b) => a.bbox.x0 - b.bbox.x0 || a.bbox.y0 - b.bbox.y0);
  
  const headers: DetectedHeader[] = [];
  const timeValues: Array<{ text: string; normalized: string; x: number; y: number }> = [];
  const dayValues: Array<{ text: string; day: DayKey; x: number; y: number }> = [];
  
  for (const word of allWords) {
    const t = word.text.trim();
    
    if (isDayText(t)) {
      const upper = t.toUpperCase();
      if (/^(MWF|MTW|TTH|TF|MW|TTHS?|MWTH|MTH|WTF|TFU|SATSU|SATH|SUNTH)$/.test(upper)) {
        const expanded = expandDayCombo(upper);
        for (const day of expanded) {
          dayValues.push({ text: t, day, x: word.bbox.x0, y: word.bbox.y0 });
        }
        headers.push({ type: "day", text: t, value: upper, x: word.bbox.x0, y: word.bbox.y0, width: word.bbox.x1 - word.bbox.x0, height: word.bbox.y1 - word.bbox.y0 });
      } else if (DAY_CODES[upper]) {
        const day = DAY_CODES[upper]!;
        dayValues.push({ text: t, day, x: word.bbox.x0, y: word.bbox.y0 });
        headers.push({ type: "day", text: t, value: upper, x: word.bbox.x0, y: word.bbox.y0, width: word.bbox.x1 - word.bbox.x0, height: word.bbox.y1 - word.bbox.y0 });
      }
    }
    
    if (isTimeText(t)) {
      const normalized = normalizeTime(t);
      if (normalized !== t || TIME_24H.test(normalized)) {
        timeValues.push({ text: t, normalized, x: word.bbox.x0, y: word.bbox.y0 });
        headers.push({ type: "time", text: t, value: normalized, x: word.bbox.x0, y: word.bbox.y0, width: word.bbox.x1 - word.bbox.x0, height: word.bbox.y1 - word.bbox.y0 });
      }
    }
  }
  
  const hasHorizontalDays = dayValues.some(d => {
    const sameRow = dayValues.filter(dd => Math.abs(dd.y - d.y) < 30);
    return sameRow.length >= 3;
  });
  
  const hasVerticalDays = dayValues.some(d => {
    const sameCol = dayValues.filter(dd => Math.abs(dd.x - d.x) < 50);
    return sameCol.length >= 3;
  });
  
  const dayHeaderRow = detectMajorityRow(dayValues.map(d => d.y), 40);
  const timeColumn = detectMajorityColumn(timeValues.map(t => t.x), 50);
  
  let layout: string;
  if (hasHorizontalDays && timeColumn > 0) {
    layout = "days-horizontal";
  } else if (hasVerticalDays && dayHeaderRow > 0) {
    layout = "days-vertical";
  } else if (dayHeaderRow > 0 && timeColumn === -1) {
    layout = "days-horizontal";
  } else if (timeColumn > 0 && dayHeaderRow === -1) {
    layout = "days-vertical";
  } else {
    layout = "mixed";
  }
  
  const dayCols = new Map<number, DayKey>();
  if (dayHeaderRow > 0) {
    for (const dv of dayValues) {
      if (Math.abs(dv.y - dayHeaderRow) < 50) {
        const col = Math.round(dv.x / 100) * 100;
        if (!dayCols.has(col)) {
          dayCols.set(col, dv.day);
        }
      }
    }
  }
  
  const timeRows = new Map<number, string>();
  if (timeColumn > 0) {
    for (const tv of timeValues) {
      if (Math.abs(tv.x - timeColumn) < 80) {
        const row = Math.round(tv.y / 40) * 40;
        if (!timeRows.has(row)) {
          timeRows.set(row, tv.normalized);
        }
      }
    }
  }
  
  const extractedClasses: ParsedClass[] = [];
  
  const subjects: Array<{ text: string; words: TimetableWord[]; x: number; y: number }> = [];
  const rooms: Array<{ text: string; words: TimetableWord[]; x: number; y: number }> = [];
  
  for (const word of allWords) {
    const t = word.text.trim();
    if (isSubjectLikeText(t) && !isTimeText(t) && !isDayText(t)) {
      const existing = subjects.find(s => Math.abs(s.x - word.bbox.x0) < 30 && Math.abs(s.y - word.bbox.y0) < 20);
      if (existing) {
        existing.text += " " + t;
        existing.words.push(word);
      } else {
        subjects.push({ text: t, words: [word], x: word.bbox.x0, y: word.bbox.y0 });
      }
    }
    if (isRoomText(t)) {
      rooms.push({ text: t, words: [word], x: word.bbox.x0, y: word.bbox.y0 });
    }
  }
  
  for (const subj of subjects) {
    const confidence = subj.words.reduce((sum, w) => sum + w.confidence, 0) / subj.words.length;
    if (confidence < 30) continue;
    
    const code = extractCourseCode(subj.text);
    
    let assignedDays: DayKey[] = [];
    let originalDays: string[] = [];
    let assignedStartTime = "";
    let assignedEndTime = "";
    let originalStartTime = "";
    let originalEndTime = "";
    let assignedRoom: string | null = null;
    
    if (layout === "days-horizontal" && dayHeaderRow > 0) {
      const closestDayCol = findClosestKey(subj.x, [...dayCols.keys()], 100);
      if (closestDayCol !== null) {
        assignedDays = [dayCols.get(closestDayCol)!];
        originalDays = [assignedDays[0]!];
      }
      
      const closestTimeRow = findClosestKey(subj.y, [...timeRows.keys()], 60);
      if (closestTimeRow !== null) {
        assignedStartTime = timeRows.get(closestTimeRow)!;
        originalStartTime = assignedStartTime;
        assignedEndTime = getEndTime(assignedStartTime);
        originalEndTime = assignedEndTime;
      }
      
      const nearbyRoom = rooms.find(r => Math.abs(r.y - subj.y) < 40 && Math.abs(r.x - subj.x) < 200);
      if (nearbyRoom) {
        assignedRoom = cleanRoomText(nearbyRoom.text);
      }
    } else if (layout === "days-vertical" && timeColumn > 0) {
      const closestDayCol = findClosestKey(subj.x, [...dayCols.keys()], 100);
      if (closestDayCol !== null) {
        assignedDays = [dayCols.get(closestDayCol)!];
        originalDays = [assignedDays[0]!];
      }
      
      const closestTimeRow = findClosestKey(subj.y, [...timeRows.keys()], 60);
      if (closestTimeRow !== null) {
        assignedStartTime = timeRows.get(closestTimeRow)!;
        originalStartTime = assignedStartTime;
        assignedEndTime = getEndTime(assignedStartTime);
        originalEndTime = assignedEndTime;
      }
      
      const nearbyRoom = rooms.find(r => Math.abs(r.y - subj.y) < 40 && Math.abs(r.x - subj.x) < 200);
      if (nearbyRoom) {
        assignedRoom = cleanRoomText(nearbyRoom.text);
      }
    } else {
      if (dayValues.length > 0) {
        const closestDay = dayValues.reduce((best, d) => {
          const dist = Math.abs(d.x - subj.x) + Math.abs(d.y - subj.y) * 0.5;
          const bestDist = best ? Math.abs(best.x - subj.x) + Math.abs(best.y - subj.y) * 0.5 : Infinity;
          return dist < bestDist ? d : best;
        }, dayValues[0]);
        if (closestDay) {
          assignedDays = [closestDay.day];
          originalDays = [closestDay.text];
        }
      }
      
      if (timeValues.length > 0) {
        const closestTime = timeValues.reduce((best, t) => {
          const dist = Math.abs(t.y - subj.y) * 2 + Math.abs(t.x - subj.x);
          const bestDist = best ? Math.abs(best.y - subj.y) * 2 + Math.abs(best.x - subj.x) : Infinity;
          return dist < bestDist ? t : best;
        }, timeValues[0]);
        if (closestTime) {
          assignedStartTime = closestTime.normalized;
          originalStartTime = closestTime.text;
          assignedEndTime = getEndTime(assignedStartTime);
          originalEndTime = assignedEndTime;
        }
      }
      
      const nearbyRoom = rooms.find(r => Math.abs(r.y - subj.y) < 50 && Math.abs(r.x - subj.x) < 250);
      if (nearbyRoom) {
        assignedRoom = cleanRoomText(nearbyRoom.text);
      }
    }
    
    if (assignedDays.length === 0 && dayValues.length > 0) {
      const closestDay = dayValues.reduce((best, d) => {
        const dist = Math.abs(d.x - subj.x) * 3 + Math.abs(d.y - subj.y) * 2;
        const bestDist = best ? Math.abs(best.x - subj.x) * 3 + Math.abs(best.y - subj.y) * 2 : Infinity;
        return dist < bestDist ? d : best;
      }, dayValues[0]);
      if (closestDay) {
        assignedDays = [closestDay.day];
        originalDays = [closestDay.text];
      }
    }
    
    if (assignedDays.length === 0 && timeValues.length === 0 && subjectClusters(subj, allWords, dayValues, timeValues).length > 0) {
      const cluster = subjectClusters(subj, allWords, dayValues, timeValues);
      for (const c of cluster) {
        if (c.type === "day") {
          assignedDays = [c.day];
          originalDays = [c.dayText];
        }
        if (c.type === "time") {
          assignedStartTime = c.time;
          originalStartTime = c.timeText;
          assignedEndTime = getEndTime(assignedStartTime);
          originalEndTime = assignedEndTime;
        }
      }
    }
    
    if (assignedDays.length === 0) {
      issues.push({ type: "missing_day", message: `Could not determine day for "${subj.text}"`, classIndex: extractedClasses.length });
    }
    
    if (!assignedStartTime) {
      issues.push({ type: "missing_time", message: `Could not determine time for "${subj.text}"`, classIndex: extractedClasses.length });
    }
    
    const classConf = Math.max(0.3, Math.min(0.95, confidence / 100));
    const dayConf = assignedDays.length > 0 ? 0.9 : 0.3;
    const timeConf = assignedStartTime ? 0.85 : 0.3;
    const roomConf = assignedRoom ? 0.8 : 0.5;
    const finalConfidence = (classConf * 0.4 + dayConf * 0.3 + timeConf * 0.2 + roomConf * 0.1);
    
    extractedClasses.push({
      subject: subj.text.trim(),
      code,
      room: assignedRoom,
      instructor: null,
      days: assignedDays,
      startTime: assignedStartTime || "09:00",
      endTime: assignedEndTime || "10:00",
      section: null,
      block: null,
      notes: null,
      confidence: Math.round(finalConfidence * 100) / 100,
      originalDays,
      originalStartTime,
      originalEndTime,
    });
  }
  
  const deduplicated = deduplicateClasses(extractedClasses);
  
  let overallConfidence = 0;
  if (deduplicated.length > 0) {
    overallConfidence = deduplicated.reduce((sum, c) => sum + c.confidence, 0) / deduplicated.length;
  }
  
  return {
    classes: deduplicated,
    metadata: {
      totalClasses: deduplicated.length,
      confidence: Math.round(overallConfidence * 100) / 100,
      layout,
      notes: deduplicated.length === 0 ? "No timetable entries found" : null,
      issues,
    },
  };
}

function expandDayCombo(combo: string): DayKey[] {
  const upper = combo.toUpperCase();
  const comboMap: Record<string, DayKey[]> = {
    MWF: ["monday", "wednesday", "friday"],
    MTW: ["monday", "tuesday", "wednesday"],
    TTH: ["tuesday", "thursday"],
    TF: ["tuesday", "friday"],
    TTHS: ["tuesday", "thursday", "saturday"],
    MW: ["monday", "wednesday"],
    TFU: ["tuesday", "friday", "sunday"],
    WTF: ["wednesday", "tuesday", "friday"],
    MTH: ["monday", "thursday"],
    TTHF: ["tuesday", "thursday", "friday"],
    MWTH: ["monday", "wednesday", "thursday"],
    SATH: ["saturday", "thursday"],
    SUNTH: ["sunday", "thursday"],
    SATSU: ["saturday", "sunday"],
    TTHSS: ["tuesday", "thursday", "saturday", "sunday"],
  };
  
  const chars = upper.split("");
  const result: DayKey[] = [];
  
  let i = 0;
  while (i < chars.length) {
    if (chars[i] === "T" && chars[i + 1] === "H") {
      result.push("thursday");
      i += 2;
    } else if (chars[i] === "T" && chars[i + 1] === "U") {
      result.push("tuesday");
      i += 2;
    } else if (chars[i] === "M") {
      result.push("monday");
      i++;
    } else if (chars[i] === "W") {
      result.push("wednesday");
      i++;
    } else if (chars[i] === "F") {
      result.push("friday");
      i++;
    } else if (chars[i] === "S" && chars[i + 1] === "A" && chars[i + 2] === "T") {
      result.push("saturday");
      i += 3;
    } else if (chars[i] === "S" && chars[i + 1] === "U" && chars[i + 2] === "N") {
      result.push("sunday");
      i += 3;
    } else {
      i++;
    }
  }
  
  if (result.length === 0 && comboMap[upper]) {
    return comboMap[upper];
  }
  
  return result;
}

function detectMajorityRow(yValues: number[], tolerance: number): number {
  if (yValues.length === 0) return -1;
  const sorted = [...yValues].sort((a, b) => a - b);
  let bestRow = sorted[0]!;
  let bestCount = 1;
  
  for (const y of sorted) {
    const count = sorted.filter(v => Math.abs(v - y) < tolerance).length;
    if (count > bestCount) {
      bestCount = count;
      bestRow = y;
    }
  }
  
  return bestCount >= 3 ? bestRow : -1;
}

function detectMajorityColumn(xValues: number[], tolerance: number): number {
  return detectMajorityRow(xValues, tolerance);
}

function findClosestKey(value: number, keys: number[], tolerance: number): number | null {
  let closest: number | null = null;
  let closestDist = Infinity;
  
  for (const key of keys) {
    const dist = Math.abs(value - key);
    if (dist < closestDist && dist < tolerance) {
      closestDist = dist;
      closest = key;
    }
  }
  
  return closest;
}

function getEndTime(startTime: string): string {
  if (!startTime.match(/^\d{2}:\d{2}$/)) return startTime;
  const [h, m] = startTime.split(":").map(Number);
  const totalMinutes = h * 60 + m + 60;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

function cleanRoomText(text: string): string {
  return text
    .replace(/^(room|rm|r\.?|lab|comlab)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface ClusterResult {
  type: "day" | "time";
  day?: DayKey;
  dayText?: string;
  time?: string;
  timeText?: string;
}

function subjectClusters(
  subj: { text: string; x: number; y: number },
  allWords: TimetableWord[],
  dayValues: Array<{ text: string; day: DayKey; x: number; y: number }>,
  timeValues: Array<{ text: string; normalized: string; x: number; y: number }>
): ClusterResult[] {
  const results: ClusterResult[] = [];
  
  const nearbyDays = dayValues.filter(d =>
    Math.abs(d.x - subj.x) < 300 && Math.abs(d.y - subj.y) < 80
  );
  if (nearbyDays.length > 0) {
    const closest = nearbyDays.reduce((best, d) => {
      const dist = Math.abs(d.x - subj.x) + Math.abs(d.y - subj.y);
      const bestDist = best ? Math.abs(best.x - subj.x) + Math.abs(best.y - subj.y) : Infinity;
      return dist < bestDist ? d : best;
    }, nearbyDays[0]);
    if (closest) {
      results.push({ type: "day", day: closest.day, dayText: closest.text });
    }
  }
  
  const nearbyTimes = timeValues.filter(t =>
    Math.abs(t.y - subj.y) < 60
  );
  if (nearbyTimes.length > 0) {
    const closest = nearbyTimes.reduce((best, t) => {
      const dist = Math.abs(t.x - subj.x);
      const bestDist = best ? Math.abs(best.x - subj.x) : Infinity;
      return dist < bestDist ? t : best;
    }, nearbyTimes[0]);
    if (closest) {
      results.push({ type: "time", time: closest.normalized, timeText: closest.text });
    }
  }
  
  return results;
}

function deduplicateClasses(classes: ParsedClass[]): ParsedClass[] {
  const seen = new Map<string, ParsedClass>();
  
  for (const cls of classes) {
    const key = `${cls.subject.toLowerCase()}|${cls.days.join(",")}|${cls.startTime}|${cls.endTime}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, cls);
    } else {
      if (cls.confidence > existing.confidence) {
        seen.set(key, cls);
      }
      if (cls.room && !existing.room) {
        const updated = { ...existing, room: cls.room };
        seen.set(key, updated);
      }
    }
  }
  
  return [...seen.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function validateParsedResult(result: ParserResult): ParserResult {
  const validatedClasses: ParsedClass[] = [];
  const issues: Array<{ type: string; message: string; classIndex?: number }> = [];
  
  for (let i = 0; i < result.classes.length; i++) {
    const cls = result.classes[i]!;
    const issues: Array<{ type: string; message: string; classIndex?: number }> = [];
    
    if (!cls.subject || cls.subject.trim().length === 0) {
      issues.push({ type: "invalid_subject", message: "Subject is empty", classIndex: i });
      continue;
    }
    
    if (cls.days.length === 0) {
      issues.push({ type: "invalid_day", message: "No valid days found", classIndex: i });
    }
    
    if (cls.startTime && cls.endTime) {
      const [sh, sm] = cls.startTime.split(":").map(Number);
      const [eh, em] = cls.endTime.split(":").map(Number);
      if (sh * 60 + sm >= eh * 60 + em) {
        issues.push({ type: "invalid_time", message: "End time must be after start time", classIndex: i });
      }
    }
    
    if (cls.confidence < 0.3) {
      issues.push({ type: "low_confidence", message: `Low confidence for "${cls.subject}"`, classIndex: i });
    }
    
    validatedClasses.push(cls);
  }
  
  const conflicts = detectConflicts(validatedClasses);
  for (const conflict of conflicts) {
    issues.push({
      type: "conflict",
      message: conflict.message,
      classIndex: conflict.classIndex,
    });
  }
  
  return {
    ...result,
    classes: validatedClasses,
    metadata: {
      ...result.metadata,
      issues: [...result.metadata.issues, ...issues],
    },
  };
}

function detectConflicts(classes: ParsedClass[]): Array<{ classIndex: number; message: string }> {
  const issues: Array<{ classIndex: number; message: string }> = [];
  
  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const a = classes[i]!;
      const b = classes[j]!;
      
      const sharedDays = a.days.filter(d => b.days.includes(d));
      if (sharedDays.length === 0) continue;
      
      const [ash, asm] = a.startTime.split(":").map(Number);
      const [aex, aem] = a.endTime.split(":").map(Number);
      const [bsh, bsm] = b.startTime.split(":").map(Number);
      const [bex, bem] = b.endTime.split(":").map(Number);
      
      const aStart = ash * 60 + asm;
      const aEnd = aex * 60 + aem;
      const bStart = bsh * 60 + bsm;
      const bEnd = bex * 60 + bem;
      
      if (aStart < bEnd && aEnd > bStart) {
        issues.push({
          classIndex: j,
          message: `"${b.subject}" overlaps with "${a.subject}" on ${sharedDays.join(", ")}`,
        });
      }
    }
  }
  
  return issues;
}
