import { it, expect } from "vitest";
import { saveBaseline } from "./runner";

/**
 * Run with `npm run bench:baseline` after a deliberate pipeline change to
 * re-seed the reference performance profile. The main benchmark test then
 * fails CI if metrics regress beyond tolerance versus this baseline.
 */
it("saves the current benchmark results as the baseline", async () => {
  await saveBaseline();
  expect(true).toBe(true);
});
