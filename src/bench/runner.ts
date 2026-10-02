/**
 * Benchmark runner.
 *
 * Runs every dataset scenario through the deterministic extraction pipeline,
 * scores field-level accuracy, confidence, latency and failure rate, then:
 *   - writes a Markdown + JSON report to ./benchmark/
 *   - compares against ./benchmark/baseline.json
 *   - marks `regression: true` (and exits non-zero under CI) when any tracked
 *     metric drops below the baseline by more than the allowed tolerance.
 *
 * Kept framework-agnostic so it can run via `vitest` (see benchmark.test.ts)
 * or directly with `tsx`/`node`. No network required — it exercises the
 * offline, deterministic part of the pipeline.
 */

import fs from "fs/promises";
import path from "path";
import { DATASET, type Scenario, type FieldKey } from "./dataset";
import { buildResult } from "@/server/lib/extraction-deterministic";
import { scoreScenario, aggregate, type BenchmarkReport, type ScenarioScore } from "./metrics";

const BENCH_DIR = path.resolve(process.cwd(), "benchmark");
const REPORT_JSON = path.join(BENCH_DIR, "report.json");
const REPORT_MD = path.join(BENCH_DIR, "report.md");
const BASELINE_JSON = path.join(BENCH_DIR, "baseline.json");

/** Allowed drop (absolute) before a metric is flagged as a regression. */
const REGRESSION_TOLERANCE = {
  averageAccuracy: 0.02,
  averageConfidence: 0.02,
  /** Latency is noisy offline; flag only a meaningful relative increase. */
  averageLatencyMs: 0,
  failureRate: 0.02,
};

/** Latency regression only when it balloons (>50% over baseline + 5ms floor). */
function latencyRegressed(current: number, baseline: number): boolean {
  return current > baseline * 1.5 + 5;
}

export interface Baseline {
  averageAccuracy: number;
  fieldAccuracies: Record<FieldKey, number>;
  averageConfidence: number;
  averageLatencyMs: number;
  failureRate: number;
}

async function writeReports(report: BenchmarkReport) {
  await fs.mkdir(BENCH_DIR, { recursive: true });
  await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(REPORT_MD, toMarkdown(report), "utf8");
}

function toMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push(`# AI Extraction Benchmark Report`);
  lines.push("");
  lines.push(`_Generated: ${report.generatedAt}_`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Scenarios | ${report.scenarios} |`);
  lines.push(`| Average Accuracy | ${(report.averageAccuracy * 100).toFixed(1)}% |`);
  lines.push(`| Average Confidence | ${(report.averageConfidence * 100).toFixed(1)}% |`);
  lines.push(`| Average Latency | ${report.averageLatencyMs.toFixed(1)} ms |`);
  lines.push(`| Failure Rate | ${(report.failureRate * 100).toFixed(1)}% |`);
  lines.push(`| Regression | ${report.regression ? "YES ⚠️" : "no"} |`);
  lines.push("");
  lines.push(`## Field-level accuracy`);
  lines.push("");
  lines.push(`| Field | Accuracy |`);
  lines.push(`| --- | --- |`);
  for (const [f, v] of Object.entries(report.fieldAccuracies)) {
    lines.push(`| ${f} | ${(v * 100).toFixed(1)}% |`);
  }
  lines.push("");
  lines.push(`## Per-scenario`);
  lines.push("");
  lines.push(`| Scenario | Category | Acc | Conf | Latency | Extracted/Expected | Conflicts |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- |`);
  for (const s of report.perScenario) {
    lines.push(
      `| ${s.id} | ${s.category} | ${(s.overallAccuracy * 100).toFixed(1)}% | ` +
        `${(s.avgConfidence * 100).toFixed(1)}% | ${s.ms.toFixed(1)}ms | ` +
        `${s.extractedCount}/${s.expectedCount} | ${s.hasConflicts ? "yes" : "no"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function loadBaseline(): Promise<Baseline | null> {
  try {
    return JSON.parse(await fs.readFile(BASELINE_JSON, "utf8")) as Baseline;
  } catch {
    return null;
  }
}

function detectRegression(report: BenchmarkReport, baseline: Baseline | null): boolean {
  if (!baseline) return false;
  const checks: Array<[string, number, number, number, boolean]> = [
    ["averageAccuracy", report.averageAccuracy, baseline.averageAccuracy, REGRESSION_TOLERANCE.averageAccuracy, false],
    ["averageConfidence", report.averageConfidence, baseline.averageConfidence, REGRESSION_TOLERANCE.averageConfidence, false],
    ["failureRate", report.failureRate, baseline.failureRate, REGRESSION_TOLERANCE.failureRate, false],
    // Latency uses a relative check, so its tolerance is ignored.
    ["averageLatencyMs", report.averageLatencyMs, baseline.averageLatencyMs, 0, true],
  ];
  for (const [name, cur, base, tol, isLatency] of checks) {
    const regressed = isLatency
      ? latencyRegressed(cur, base)
      : base - cur > tol;
    if (regressed) {
      console.error(`[BENCH] REGRESSION: ${name} dropped from ${base.toFixed(3)} to ${cur.toFixed(3)}`);
      return true;
    }
  }
  return false;
}

export interface RunOptions {
  write?: boolean;
  enforceBaseline?: boolean;
}

export async function runBenchmark(opts: RunOptions = {}): Promise<{ report: BenchmarkReport; baseline: Baseline | null }> {
  const write = opts.write ?? true;
  const scores: ScenarioScore[] = [];
  let failures = 0;

  for (const scenario of DATASET as Scenario[]) {
    const t0 = performance.now();
    let result = null;
    try {
      result = buildResult(scenario.simulatedRaw);
    } catch (err) {
      failures++;
      console.error(`[BENCH] scenario ${scenario.id} failed:`, err);
    }
    const ms = performance.now() - t0;

    if (result) {
      scores.push(scoreScenario(scenario.id, scenario.category, scenario.expected, result, ms));
    } else {
      scores.push({
        id: scenario.id,
        category: scenario.category,
        extractedCount: 0,
        expectedCount: scenario.expected.length,
        matchedCount: 0,
        fieldScores: {} as ScenarioScore["fieldScores"],
        overallAccuracy: 0,
        avgConfidence: 0,
        hasConflicts: false,
        ms,
      });
    }
  }

  const report = aggregate(scores, failures);
  const baseline = await loadBaseline();
  report.regression = detectRegression(report, baseline);

  if (write) {
    await writeReports(report);
    console.log(`[BENCH] Report written to ${REPORT_MD}`);
    if (report.regression) console.error(`[BENCH] Performance regression detected!`);
  }

  if (opts.enforceBaseline && report.regression) {
    throw new Error("Benchmark regression detected — see benchmark/report.md");
  }

  return { report, baseline };
}

/** Persist the current report as the new baseline. */
export async function saveBaseline() {
  const { report } = await runBenchmark({ write: false });
  const baseline: Baseline = {
    averageAccuracy: report.averageAccuracy,
    fieldAccuracies: report.fieldAccuracies,
    averageConfidence: report.averageConfidence,
    averageLatencyMs: report.averageLatencyMs,
    failureRate: report.failureRate,
  };
  await fs.mkdir(BENCH_DIR, { recursive: true });
  await fs.writeFile(BASELINE_JSON, JSON.stringify(baseline, null, 2), "utf8");
  console.log(`[BENCH] Baseline saved to ${BASELINE_JSON}`);
}
