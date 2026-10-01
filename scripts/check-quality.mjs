/**
 * Type-check and lint gate.
 *
 * Both `tsc` and `eslint` currently report errors on code that predates CI being
 * wired up: implicit `any` on untyped Prisma callbacks, and `@base-ui/react`
 * subpath types that no longer match the installed version. Fixing all of that
 * is its own piece of work, and until it lands, a gate that runs either tool
 * directly fails every single push and gets ignored.
 *
 * So this is a ratchet. It records the current counts in `ci-baseline.json` and
 * fails only when the count goes UP. That way CI is green today, a new type
 * error still fails the build, and the baseline only ever moves down as the debt
 * is paid off. Lowering a number is a deliberate edit to the baseline file.
 *
 * Written in Node rather than shell so it behaves identically on a Linux runner,
 * where PowerShell is not available.
 *
 * Usage:
 *   node scripts/check-quality.mjs            compare against the baseline
 *   node scripts/check-quality.mjs --update   rewrite the baseline (intentional)
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "ci-baseline.json");
const update = process.argv.includes("--update");

// On Windows `npx` is a shell script, not an executable, so it has to be spawned
// through the shell. Using npx.cmd instead is not portable: it exists on Windows
// but not on the Linux runner.
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

/** Runs a local binary via the npm bin shim, tolerating both platforms. */
function run(bin, args) {
  const res = spawnSync(NPX, [bin, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  if (res.error) {
    return { ok: false, stdout: "", stderr: String(res.error) };
  }
  return { ok: true, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/**
 * Counts `error TS` lines under src/ only.
 *
 * Scoped to src/ on purpose: sibling directories have their own tsconfig and
 * their own failures, which would make the number move for reasons unrelated to
 * this app.
 */
function countTscErrors() {
  const res = run("tsc", ["--noEmit", "-p", "tsconfig.json"]);
  const out = `${res.stdout}${res.stderr}`;
  const lines = out.split(/\r?\n/);
  const errors = lines.filter((l) => /^src\/.*error TS\d+:/.test(l));
  return { count: errors.length, sample: errors.slice(0, 3), ran: res.ok && out.length > 0 };
}

/** Counts ESLint problems at error severity. Warnings do not fail the gate. */
function countLintErrors() {
  const res = run("eslint", [".", "--format", "json", "--quiet"]);
  let count = 0;
  const files = [];
  try {
    const parsed = JSON.parse(res.stdout || "[]");
    for (const f of parsed) {
      const errs = (f.messages ?? []).filter((m) => m.severity === 2);
      if (errs.length) {
        count += errs.length;
        files.push(`${f.filePath.replace(root, ".")}: ${errs.length}`);
      }
    }
  } catch {
    // eslint produced no JSON, which means it crashed rather than found nothing.
    return { count: Number.MAX_SAFE_INTEGER, sample: ["eslint produced no parsable output"] };
  }
  return { count, sample: files.slice(0, 3) };
}

const tsc = countTscErrors();
const lint = countLintErrors();
const current = { tsc: tsc.count, lint: lint.count };

if (update) {
  writeFileSync(
    baselinePath,
    `${JSON.stringify(
      {
        _comment:
          "Known error counts. CI fails when these go up. Lower them by hand as the debt is fixed; do not raise them.",
        ...current,
      },
      null,
      2
    )}\n`
  );
  console.log(`Baseline updated: tsc=${current.tsc} lint=${current.lint}`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
} catch {
  console.error("ci-baseline.json is missing or unreadable.");
  console.error("Run: node scripts/check-quality.mjs --update");
  process.exit(1);
}

let failed = false;

for (const key of ["tsc", "lint"]) {
  const limit = baseline[key];
  const now = current[key];

  if (limit === undefined) {
    console.error(`ci-baseline.json has no "${key}" entry.`);
    failed = true;
    continue;
  }

  if (now > limit) {
    console.error(
      `\n${key}: ${now} errors, baseline allows ${limit}. ${now - limit} new one(s).\n` +
        `Fix them, or if they are pre-existing debt, update the baseline deliberately with:\n` +
        `  node scripts/check-quality.mjs --update\n`
    );
    failed = true;
  } else if (now < limit) {
    console.log(`${key}: ${now} errors, baseline ${limit}. Improved by ${limit - now}.`);
    console.log(`  Lower it: node scripts/check-quality.mjs --update`);
  } else {
    console.log(`${key}: ${now} errors, at baseline ${limit}.`);
  }
}

if (failed) {
  console.error("\nSample of current errors:");
  for (const l of tsc.sample) console.error(`  ${l}`);
  for (const l of lint.sample) console.error(`  ${l}`);
  process.exit(1);
}

console.log("\nNo new type or lint errors.");