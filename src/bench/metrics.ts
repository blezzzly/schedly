/**
 * Scoring utilities for the benchmark suite.
 *
 * Accuracy is measured field-by-field against ground truth. The pipeline is
 * expected to de-duplicate merged-cell / noisy OCR rows, so we match expected
 * classes to extracted classes by the stable unique key (subject + room +
 * startTime + endTime) rather than by row index.
 */

import type { ExtractionResult } from "@/server/validators/ai.schema";
import type { GroundTruthClass, FieldKey } from "./dataset";

export interface FieldScore {
  field: FieldKey;
  correct: number;
  total: number;
  accuracy: number;
}

export interface ScenarioScore {
  id: string;
  category: string;
  extractedCount: number;
  expectedCount: number;
  matchedCount: number;
  fieldScores: Record<FieldKey, FieldScore>;
  overallAccuracy: number;
  avgConfidence: number;
  hasConflicts: boolean;
  ms: number;
}

const FIELDS: FieldKey[] = ["subject", "days", "startTime", "endTime", "room", "instructor"];

function keyOf(c: { subject?: string; room?: string | null; startTime?: string; endTime?: string }): string {
  return `${String(c.subject).toLowerCase()}|${String(c.room ?? "").toLowerCase()}|${c.startTime}|${c.endTime}`;
}

function fieldEqual(field: FieldKey, expected: GroundTruthClass, actual: Record<string, unknown>): boolean {
  if (field === "days") {
    const ed = expected.days.map((d) => d.toLowerCase()).sort();
    const ad = ((actual.days as string[]) ?? []).map((d) => String(d).toLowerCase()).sort();
    return ed.length === ad.length && ed.every((d, i) => d === ad[i]);
  }
  const ev = (expected as unknown as Record<string, unknown>)[field];
  const av = actual[field];
  return String(av ?? "").toLowerCase() === String(ev ?? "").toLowerCase();
}

export function scoreScenario(
  scenarioId: string,
  category: string,
  expected: GroundTruthClass[],
  result: ExtractionResult,
  ms: number,
): ScenarioScore {
  const extracted = result.classes as unknown as Record<string, unknown>[];

  const usedKeys = new Set<string>();
  let matched = 0;
  const fieldTotals: Record<FieldKey, { correct: number; total: number }> = {
    subject: { correct: 0, total: 0 },
    days: { correct: 0, total: 0 },
    startTime: { correct: 0, total: 0 },
    endTime: { correct: 0, total: 0 },
    room: { correct: 0, total: 0 },
    instructor: { correct: 0, total: 0 },
  };

  for (const e of expected) {
    const k = keyOf(e);
    const actual = extracted.find((c) => keyOf(c) === k && !usedKeys.has(k));
    if (actual) {
      usedKeys.add(k);
      matched++;
      for (const f of FIELDS) {
        fieldTotals[f].total++;
        if (fieldEqual(f, e, actual)) fieldTotals[f].correct++;
      }
    }
  }

  const fieldScores = {} as Record<FieldKey, FieldScore>;
  let overallCorrect = 0;
  let overallTotal = 0;
  for (const f of FIELDS) {
    const t = fieldTotals[f];
    fieldScores[f] = {
      field: f,
      correct: t.correct,
      total: t.total,
      accuracy: t.total === 0 ? 1 : t.correct / t.total,
    };
    overallCorrect += t.correct;
    overallTotal += t.total;
  }

  const perClass = extracted.map((c) => Number((c as { confidence?: number }).confidence ?? 0));
  const metaConf = Number((result.metadata as { confidence?: number }).confidence ?? 0);
  const avgConfidence = perClass.length
    ? perClass.reduce((a, b) => a + b, 0) / perClass.length
    : metaConf;

  return {
    id: scenarioId,
    category,
    extractedCount: extracted.length,
    expectedCount: expected.length,
    matchedCount: matched,
    fieldScores,
    overallAccuracy: overallTotal === 0 ? 1 : overallCorrect / overallTotal,
    avgConfidence,
    hasConflicts: result.metadata.hasConflicts ?? false,
    ms,
  };
}

export interface BenchmarkReport {
  generatedAt: string;
  scenarios: number;
  averageAccuracy: number;
  fieldAccuracies: Record<FieldKey, number>;
  averageConfidence: number;
  averageLatencyMs: number;
  failureRate: number;
  regression: boolean;
  perScenario: ScenarioScore[];
}

export function aggregate(scores: ScenarioScore[], failures: number): BenchmarkReport {
  const scenarios = scores.length;
  const totalFieldAcc: Record<FieldKey, number[]> = {
    subject: [], days: [], startTime: [], endTime: [], room: [], instructor: [],
  };
  let accSum = 0;
  let confSum = 0;
  let latSum = 0;

  for (const s of scores) {
    accSum += s.overallAccuracy;
    confSum += s.avgConfidence;
    latSum += s.ms;
    for (const f of FIELDS) totalFieldAcc[f].push(s.fieldScores[f].accuracy);
  }

  const fieldAccuracies = {} as Record<FieldKey, number>;
  for (const f of FIELDS) {
    const arr = totalFieldAcc[f];
    fieldAccuracies[f] = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    scenarios,
    averageAccuracy: scenarios ? accSum / scenarios : 0,
    fieldAccuracies,
    averageConfidence: scenarios ? confSum / scenarios : 0,
    averageLatencyMs: scenarios ? latSum / scenarios : 0,
    failureRate: scenarios + failures > 0 ? failures / (scenarios + failures) : 0,
    regression: false,
    perScenario: scores,
  };
}
