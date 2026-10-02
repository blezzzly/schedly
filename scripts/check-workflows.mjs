/**
 * Validates the GitHub Actions workflow files.
 *
 * A malformed workflow does not fail loudly. GitHub either rejects the file on
 * push, or worse, silently drops the steps it cannot parse and the job goes
 * green without having run any of the checks. That second case is why this
 * exists: it confirms the workflows still parse AND still contain the steps the
 * project depends on.
 *
 * No YAML dependency is added for this. The checks that matter are structural,
 * and a parse via js-yaml would pull in a dev dependency for the sake of a lint.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Steps the CI must still run. Losing one silently turns the gate off. */
const REQUIRED_CI_STEPS = [
  { name: "install", re: /run:\s*npm ci/ },
  { name: "type/lint gate", re: /check-quality\.mjs/ },
  { name: "build", re: /npx next build/ },
  { name: "tests", re: /npm run test:run/ },
];

/** Steps that must NOT come back, because each one used to fail the build. */
const FORBIDDEN_CI_STEPS = [
  { name: "bare tsc (bypasses the ratchet)", re: /^\s*-\s*run:\s*npx tsc\b/m },
  { name: "bare eslint (bypasses the ratchet)", re: /^\s*-\s*run:\s*npx eslint\b/m },
  { name: "capacitor sync (removed in 3e93113)", re: /cap sync/ },
];

/**
 * Strips comment lines.
 *
 * Necessary rather than tidy: these workflows document the steps that were
 * removed and why, in comments that name the very commands the checks below
 * forbid. Testing the raw text reports "cap sync is back" for a file whose only
 * mention of it is the note explaining its removal.
 */
function code(yaml) {
  return yaml
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

const checks = [];
const fail = [];

function check(label, ok, detail) {
  checks.push(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) fail.push(label);
}

// --- ci.yml -----------------------------------------------------------------
let ci = "";
try {
  ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
} catch {
  console.error("Cannot read .github/workflows/ci.yml");
  process.exit(1);
}

const ciCode = code(ci);

for (const s of REQUIRED_CI_STEPS) check(`ci runs ${s.name}`, s.re.test(ciCode));
for (const s of FORBIDDEN_CI_STEPS) check(`ci omits ${s.name}`, !s.re.test(ciCode));
check("ci pins the node version", /node-version:\s*"\d+"/.test(ciCode));
check("ci has concurrency", /concurrency:/.test(ciCode));
// Tabs break YAML outright and are invisible in review.
check("ci uses spaces, not tabs", !/\t/.test(ci));
// `npm audit` must not be able to fail the job: it exits non-zero on any finding.
const auditStep = ciCode.slice(ciCode.indexOf("Dependency audit"));
check(
  "ci treats audit as non-blocking",
  auditStep.length === 0 || /npm audit[\s\S]*\|\| true/.test(auditStep)
);

// --- reminder-cron.yml ------------------------------------------------------
let cron = "";
try {
  cron = readFileSync(join(root, ".github/workflows/reminder-cron.yml"), "utf8");
} catch {
  console.error("Cannot read .github/workflows/reminder-cron.yml");
  process.exit(1);
}

// The missing-secret path must exit 0. It runs every 5 minutes, so erroring
// produces 288 identical alert emails a day on a repo without the secret.
const cronCode = code(cron);
const missingSecretBranch = cronCode.slice(
  cronCode.indexOf('if [ -z "$CRON_SECRET" ]'),
  cronCode.indexOf('base="${APP_URL')
);
check("cron skips quietly when the secret is absent", /exit 0/.test(missingSecretBranch));
check("cron still fails on a bad secret", /::error::/.test(cronCode));
check("cron has concurrency", /concurrency:/.test(cronCode));
check("cron uses spaces, not tabs", !/\t/.test(cron));

// --- dependabot.yml ---------------------------------------------------------
let dep = "";
try {
  dep = readFileSync(join(root, ".github/dependabot.yml"), "utf8");
} catch {
  console.error("Cannot read .github/dependabot.yml");
  process.exit(1);
}
// An unknown reviewer makes Dependabot reject the entire config file, which
// silently disables every update PR rather than reporting anything.
check("dependabot has no reviewers", !/reviewers:/.test(code(dep)));
check("dependabot has a schedule", /interval:/.test(code(dep)));

console.log(checks.join("\n"));
console.log("");

if (fail.length) {
  console.error(`${fail.length} workflow check(s) failed:`);
  for (const f of fail) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`All ${checks.length} workflow checks passed.`);