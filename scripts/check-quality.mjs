/**
 * Type-check and lint report, with a per-platform ratchet.
 *
 * Both tools report errors on code that predates CI being wired up: implicit
 * `any` on untyped Prisma callbacks, and `@base-ui/react` subpath types that no
 * longer match the installed version. Fixing all of that is its own work, and
 * until it lands, a gate that runs either tool directly fails every push.
 *
 * The ratchet records counts per platform in ci-baseline.json and fails only
 * when the count goes up, so a new type error still breaks the build while the
 * existing debt does not.
 *
 * Per-platform, not one number, because the counts are not portable. Windows
 * resolves imports case-insensitively, so `import x from "./Foo"` resolves
 * against `./foo` on a developer machine and fails to resolve on the Linux
 * runner. The two platforms therefore have genuinely different error sets, and a
 * single threshold either fails CI on Linux or stops catching regressions on
 * Windows.
 *
 * A platform with no recorded baseline is reported, not failed: guessing a
 * threshold for an uncalibrated platform produces a red build with nothing
 * wrong in it, which is how this check first failed.
 *
 * Usage:
 *   node scripts/check-quality.mjs            compare against the baseline
 *   node scripts/check-quality.mjs --update   record this platform's counts
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "ci-baseline.json");
const update = process.argv.includes("--update");
const platform = process.platform;

const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

/** Runs a locally installed binary through the npm bin shim. */
function run(bin, args) {
  const res = spawnSync(NPX, [bin, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  return {
    crashed: Boolean(res.error),
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

/**
 * Counts `error TS` lines under src/ only.
 *
 * Scoped to src/ because sibling directories have their own tsconfig and their
 * own failures, which would move the number for reasons unrelated to this app.
 */
function countTscErrors() {
  const r = run("tsc", ["--noEmit", "-p", "tsconfig.json"]);
  const out = `${r.stdout}${r.stderr}`;
  const errors = out.split(/\r?\n/).filter((l) => /^src\/.*error TS\d+:/.test(l));
  return { count: errors.length, sample: errors.slice(0, 3), ok: !r.crashed };
}

/** Counts ESLint problems at error severity. Warnings do not fail the gate. */
function countLintErrors() {
  const r = run("eslint", [".", "--format", "json", "--quiet"]);
  let count = 0;
  const files = [];
  try {
    for (const f of JSON.parse(r.stdout || "[]")) {
      const errs = (f.messages ?? []).filter((m) => m.severity === 2);
      if (errs.length) {
        count += errs.length;
        files.push(`${f.filePath.replace(root, ".")}: ${errs.length}`);
      }
    }
  } catch {
    // No parsable JSON means eslint crashed, which is a real failure and not
    // the same thing as finding nothing.
    return { count: Number.MAX_SAFE_INTEGER, sample: ["eslint produced no parsable output"], ok: false };
  }
  return { count, sample: files.slice(0, 3), ok: true };
}

const tsc = countTscErrors();
const lint = countLintErrors();
const current = { tsc: tsc.count, lint: lint.count };

// A tool that could not run is always a failure, on every platform.
for (const [name, r] of [["tsc", tsc], ["eslint", lint]]) {
  if (!r.ok) {
    console.error(`${name} could not be run on ${platform}.`);
    for (const s of r.sample) console.error(`  ${s}`);
    process.exit(1);
  }
}

if (update) {
  let baseline = {};
  try {
    baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  } catch {
    /* first write */
  }
  baseline.byPlatform ??= {};
  baseline.byPlatform[platform] = {
    tsc: current.tsc,
    lint: current.lint,
  };
  baseline._comment =
    "Known error counts per platform. CI fails when a calibrated platform goes " +
    "above its number; an uncalibrated platform is reported only. Lower these by " +
    "hand as the debt is fixed, never raise them.";
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`Recorded ${platform}: tsc=${current.tsc} lint=${current.lint}`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
} catch {
  console.error("ci-baseline.json is missing. Run: node scripts/check-quality.mjs --update");
  process.exit(1);
}

const calibrated = baseline.byPlatform?.[platform];

// Always surface the numbers, whatever the outcome. On CI these only appear in
// the step log, and they are what a new platform needs in order to be calibrated.
console.log(`platform: ${platform}`);

if (!calibrated) {
  console.log("");
  console.log(`No baseline recorded for ${platform}, so nothing is enforced here.`);
  console.log(`  tsc:  ${current.tsc}`);
  console.log(`  lint: ${current.lint}`);
  console.log("");
  console.log(`Record it with: node scripts/check-quality.mjs --update`);
  console.log(`(run on ${platform}, so the numbers match this environment)`);
  process.exit(0);
}

let failed = false;
for (const key of ["tsc", "lint"]) {
  const limit = calibrated[key];
  const now = current[key];

  if (limit === undefined) {
    console.error(`Baseline for ${platform} has no "${key}" entry.`);
    failed = true;
  } else if (now > limit) {
    console.error(
      `\n${key}: ${now} errors on ${platform}, baseline allows ${limit}. ` +
        `${now - limit} new one(s).\nFix them, or update the baseline deliberately.`
    );
    failed = true;
  } else if (now < limit) {
    console.log(`${key}: ${now} errors, baseline ${limit}. Improved by ${limit - now}.`);
  } else {
    console.log(`${key}: ${now} errors, at baseline ${limit}.`);
  }
}

if (failed) {
  console.error("\nSample of current errors:");
  for (const l of [...tsc.sample, ...lint.sample]) console.error(`  ${l}`);
  process.exit(1);
}

console.log("\nNo new type or lint errors.");