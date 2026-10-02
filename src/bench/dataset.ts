/**
 * Benchmark dataset for the AI extraction pipeline.
 *
 * The dataset is self-contained: each scenario pairs a ground-truth record set
 * with a *simulated raw AI output* that mimics the kind of noisy JSON a vision
 * model typically returns for that image type (camera photo, screenshot, PDF,
 * rotated, low-light, merged cells, handwritten, different universities). This
 * lets the benchmark measure the deterministic pipeline's field-level accuracy,
 * de-duplication, and normalization offline and deterministically.
 *
 * A lightweight synthetic PNG fixture is also generated per scenario so the
 * image-hash cache path is exercised end to end with real image bytes.
 */

import sharp from "sharp";
import type { ExtractionResult } from "@/server/validators/ai.schema";

export type FieldKey = "subject" | "days" | "startTime" | "endTime" | "room" | "instructor";

export interface GroundTruthClass {
  subject: string;
  days: string[];
  startTime: string;
  endTime: string;
  room: string;
  instructor: string;
}

export interface Scenario {
  id: string;
  /** Human-readable image category (camera, screenshot, pdf, ...). */
  category: string;
  description: string;
  /** Ground-truth classes the pipeline should recover. */
  expected: GroundTruthClass[];
  /** Simulated raw AI output (what a vision model would return). */
  simulatedRaw: Record<string, unknown>;
}

function class_(subject: string, days: string[], start: string, end: string, room: string, instructor: string): GroundTruthClass {
  return { subject, days, startTime: start, endTime: end, room, instructor };
}

export const DATASET: Scenario[] = [
  {
    id: "camera-photo-clean",
    category: "camera-photo",
    description: "Sharp phone photo of a printed timetable, clean lighting",
    expected: [
      class_("Programming 2", ["monday", "wednesday"], "07:30", "09:00", "Lab 301", "Prof. Santos"),
      class_("Calculus", ["tuesday", "thursday"], "09:00", "10:30", "Room 205", "Dr. Reyes"),
    ],
    simulatedRaw: {
      semester: "1st Semester 2026",
      classes: [
        { subject: "Programming 2", courseCode: "CS102", days: ["MW"], startTime: "07:30", endTime: "09:00", room: "Lab 301", instructor: "Prof. Santos" },
        { subject: "Calculus", courseCode: "MATH201", days: ["TTH"], startTime: "09:00", endTime: "10:30", room: "Room 205", instructor: "Dr. Reyes" },
      ],
      metadata: { totalClasses: 2, confidence: 0.96, notes: null },
    },
  },
  {
    id: "screenshot-highdpi",
    category: "screenshot",
    description: "App/website screenshot at high DPI",
    expected: [
      class_("Data Structures", ["monday", "wednesday", "friday"], "13:00", "14:30", "ICT 4", "Engr. Cruz"),
      class_("Physics", ["tuesday"], "10:00", "12:00", "Lab 2", "Mr. Tan"),
    ],
    simulatedRaw: {
      semester: null,
      classes: [
        { subject: "Data Structures", courseCode: "CS103", days: ["MWF"], startTime: "13:00", endTime: "14:30", room: "ICT 4", instructor: "Engr. Cruz" },
        { subject: "Physics", courseCode: "PHY101", days: ["T"], startTime: "10:00", endTime: "12:00", room: "Lab 2", instructor: "Mr. Tan" },
      ],
      metadata: { totalClasses: 2, confidence: 0.94, notes: null },
    },
  },
  {
    id: "pdf-export",
    category: "pdf",
    description: "Exported PDF timetable with crisp text",
    expected: [
      class_("Chemistry", ["thursday"], "15:00", "17:00", "Chem Lab", "Dr. Lim"),
    ],
    simulatedRaw: {
      semester: "2nd Semester",
      classes: [
        { subject: "Chemistry", courseCode: "CHEM11", days: ["TH"], startTime: "15:00", endTime: "17:00", room: "Chem Lab", instructor: "Dr. Lim" },
      ],
      metadata: { totalClasses: 1, confidence: 0.95, notes: null },
    },
  },
  {
    id: "rotated-90",
    category: "rotated",
    description: "Photo taken rotated 90deg; preprocessing should orient it",
    expected: [
      class_("History", ["friday"], "08:00", "09:30", "Room 10", "Mrs. Aguinaldo"),
      class_("PE", ["monday"], "16:00", "18:00", "Gym", "Coach Bautista"),
    ],
    simulatedRaw: {
      semester: null,
      classes: [
        { subject: "History", courseCode: "HIST1", days: ["F"], startTime: "08:00", endTime: "09:30", room: "Room 10", instructor: "Mrs. Aguinaldo" },
        { subject: "PE", courseCode: "PE1", days: ["M"], startTime: "16:00", endTime: "18:00", room: "Gym", instructor: "Coach Bautista" },
      ],
      metadata: { totalClasses: 2, confidence: 0.9, notes: null },
    },
  },
  {
    id: "low-light",
    category: "low-light",
    description: "Dimly lit photo; lower model confidence expected",
    expected: [
      class_("Biology", ["wednesday"], "11:00", "12:30", "Lab 5", "Dr. Mendoza"),
    ],
    simulatedRaw: {
      semester: null,
      classes: [
        { subject: "Biology", courseCode: "BIO11", days: ["W"], startTime: "11:00", endTime: "12:30", room: "Lab 5", instructor: "Dr. Mendoza" },
      ],
      metadata: { totalClasses: 1, confidence: 0.72, notes: "low confidence from low light" },
    },
  },
  {
    id: "merged-cells",
    category: "merged-cells",
    description: "Timetable with merged day cells -> OCR emits duplicate rows that must merge",
    expected: [
      class_("English", ["tuesday", "thursday"], "09:30", "11:00", "Room 3", "Ms. Garcia"),
    ],
    simulatedRaw: {
      semester: null,
      classes: [
        // Same class emitted per day by naive OCR — pipeline must merge via unique key.
        { subject: "English", courseCode: "ENG1", days: ["T"], startTime: "09:30", endTime: "11:00", room: "Room 3", instructor: "Ms. Garcia" },
        { subject: "English", courseCode: "ENG1", days: ["TH"], startTime: "09:30", endTime: "11:00", room: "Room 3", instructor: "Ms. Garcia" },
      ],
      metadata: { totalClasses: 2, confidence: 0.88, notes: "merged cell split into rows" },
    },
  },
  {
    id: "handwritten",
    category: "handwritten",
    description: "Handwritten planner; ambiguous entries, some nulls",
    expected: [
      class_("Art", ["saturday"], "10:00", "12:00", "Studio", "Prof. Luna"),
    ],
    simulatedRaw: {
      semester: null,
      classes: [
        { subject: "Art", courseCode: null, days: ["SAT"], startTime: "10:00", endTime: "12:00", room: "Studio", instructor: "Prof. Luna" },
      ],
      metadata: { totalClasses: 1, confidence: 0.65, notes: "handwritten; course code illegible" },
    },
  },
  {
    id: "uni-a-state",
    category: "university-a",
    description: "State university format: block-based, day tokens like 'M-T-W'",
    expected: [
      class_("Thermodynamics", ["monday", "tuesday", "wednesday"], "07:00", "08:30", "ENG 210", "Dr. Villanueva"),
    ],
    simulatedRaw: {
      semester: "1st Sem AY 2026",
      classes: [
        { subject: "Thermodynamics", courseCode: "ME221", days: ["M-T-W"], startTime: "07:00", endTime: "08:30", room: "ENG 210", instructor: "Dr. Villanueva" },
      ],
      metadata: { totalClasses: 1, confidence: 0.91, notes: null },
    },
  },
  {
    id: "uni-b-private",
    category: "university-b",
    description: "Private university: 12-hour times and 'TThS' combos",
    expected: [
      class_("Accounting", ["tuesday", "thursday", "saturday"], "13:30", "15:00", "Bldg B 401", "Ms. Torres"),
    ],
    simulatedRaw: {
      semester: null,
      classes: [
        { subject: "Accounting", courseCode: "ACCT2", days: ["TThS"], startTime: "01:30 PM", endTime: "03:00 PM", room: "Bldg B 401", instructor: "Ms. Torres" },
      ],
      metadata: { totalClasses: 1, confidence: 0.89, notes: "12h times" },
    },
  },
  {
    id: "noise-duplicate-ocr",
    category: "noise",
    description: "Heavy OCR noise: duplicated detections and a not-a-schedule hit",
    expected: [
      class_("Zoology", ["friday"], "14:00", "16:00", "Lab 9", "Dr. Castillo"),
    ],
    simulatedRaw: {
      semester: null,
      classes: [
        { subject: "Zoology", courseCode: "BIO22", days: ["F"], startTime: "14:00", endTime: "16:00", room: "Lab 9", instructor: "Dr. Castillo" },
        { subject: "Zoology", courseCode: "BIO22", days: ["F"], startTime: "14:00", endTime: "16:00", room: "Lab 9", instructor: "Dr. Castillo" },
        { subject: "Zoology", courseCode: "BIO22", days: ["F"], startTime: "14:00", endTime: "16:00", room: "Lab 9", instructor: "Dr. Castillo" },
      ],
      metadata: { totalClasses: 3, confidence: 0.82, notes: "duplicate OCR rows" },
    },
  },
  {
    id: "tf-day-bug-regression",
    category: "regression",
    description: "TF must be Tue+Fri; a Thu class must NOT falsely overlap",
    expected: [
      class_("Understanding the Self", ["tuesday", "friday"], "14:30", "16:00", "Room 1", "Prof. Cruz"),
      class_("Values Education", ["thursday"], "13:00", "16:00", "Room 2", "Dr. Santos"),
    ],
    simulatedRaw: {
      semester: null,
      classes: [
        { subject: "Understanding the Self", courseCode: "UST1", days: ["TF"], startTime: "2:30 PM", endTime: "4:00 PM", room: "Room 1", instructor: "Prof. Cruz" },
        { subject: "Values Education", courseCode: "VAL1", days: ["TH"], startTime: "1:00 PM", endTime: "4:00 PM", room: "Room 2", instructor: "Dr. Santos" },
      ],
      metadata: { totalClasses: 2, confidence: 0.95, notes: null },
    },
  },
];

/**
 * Generate a simple synthetic PNG representing a scenario. The pixels are not a
 * real timetable — they only exist so the image-hash cache operates on genuine
 * image bytes (and so the dataset directory ships with concrete fixtures).
 */
export async function generateFixturePng(scenario: Scenario): Promise<Buffer> {
  const W = 320;
  const H = 200 + scenario.expected.length * 24;
  // Fill with a light background, draw colored rows per expected class.
  const channels = 3;
  const data = Buffer.alloc(W * H * channels, 245);
  scenario.expected.forEach((c, i) => {
    const y = 40 + i * 24;
    for (let x = 10; x < W - 10; x++) {
      for (let yy = y; yy < y + 16; yy++) {
        const idx = (yy * W + x) * channels;
        // Pseudo-random but deterministic tint per class.
        const seed = (i * 37 + x) % 255;
        data[idx] = (seed + 30) % 255;
        data[idx + 1] = (seed * 2) % 255;
        data[idx + 2] = (seed * 3) % 255;
      }
    }
  });
  return sharp(data, { raw: { width: W, height: H, channels } }).png().toBuffer();
}

/** A deliberately near-duplicate fixture (slight pixel shift) to test cache tolerance. */
export async function generateVariantPng(scenario: Scenario): Promise<Buffer> {
  const base = await generateFixturePng(scenario);
  return sharp(base).modulate({ brightness: 1.05 }).png().toBuffer();
}

export type { ExtractionResult };
