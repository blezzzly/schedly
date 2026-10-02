import { describe, it, expect } from "vitest";
import { normalizeDays } from "./day-normalizer";

const daysOf = (input: unknown) => normalizeDays(input).days;

describe("normalizeDays — single abbreviations", () => {
  it("M → Monday", () => expect(daysOf(["M"])).toEqual(["monday"]));
  it("T → Tuesday", () => expect(daysOf(["T"])).toEqual(["tuesday"]));
  it("W → Wednesday", () => expect(daysOf(["W"])).toEqual(["wednesday"]));
  it("TH → Thursday", () => expect(daysOf(["TH"])).toEqual(["thursday"]));
  it("F → Friday", () => expect(daysOf(["F"])).toEqual(["friday"]));
  it("SAT → Saturday", () => expect(daysOf(["SAT"])).toEqual(["saturday"]));
  it("SUN → Sunday", () => expect(daysOf(["SUN"])).toEqual(["sunday"]));
});

describe("normalizeDays — combined codes (regression-critical)", () => {
  it("TF → Tuesday + Friday (NOT Thursday)", () =>
    expect(daysOf(["TF"])).toEqual(["tuesday", "friday"]));
  it("TTH → Tuesday + Thursday", () =>
    expect(daysOf(["TTH"])).toEqual(["tuesday", "thursday"]));
  it("MWF → Monday + Wednesday + Friday", () =>
    expect(daysOf(["MWF"])).toEqual(["monday", "wednesday", "friday"]));
  it("MW → Monday + Wednesday", () =>
    expect(daysOf(["MW"])).toEqual(["monday", "wednesday"]));
  it("MTW → Monday + Tuesday + Wednesday", () =>
    expect(daysOf(["MTW"])).toEqual(["monday", "tuesday", "wednesday"]));
  it("WTF → Wednesday + Tuesday + Friday", () =>
    expect(daysOf(["WTF"])).toEqual(["tuesday", "wednesday", "friday"]));
});

describe("normalizeDays — full names & mixed", () => {
  it("full names pass through lowercased", () =>
    expect(daysOf(["Monday", "Friday"])).toEqual(["monday", "friday"]));
  it("mixed case abbreviations", () =>
    expect(daysOf(["thu", "Fri"])).toEqual(["thursday", "friday"]));
  it("slash/space separated combos", () => {
    expect(daysOf(["M/W/F"])).toEqual(["monday", "wednesday", "friday"]);
    expect(daysOf(["T - Th"])).toEqual(["tuesday", "thursday"]);
    expect(daysOf(["MW F"])).toEqual(["monday", "wednesday", "friday"]);
  });
});

describe("normalizeDays — no substring confusion", () => {
  it('"TF" is never treated as "TH"', () =>
    expect(daysOf(["TF"])).toEqual(["tuesday", "friday"]));
  it('"TH" stays Thursday even next to "T"', () =>
    expect(daysOf(["TH"])).toEqual(["thursday"]));
});

describe("normalizeDays — certainty & ambiguity", () => {
  it("full names are certain (certainty = 1)", () => {
    const r = normalizeDays(["Monday"]);
    expect(r.certainty).toBe(1);
    expect(r.unmatched).toHaveLength(0);
  });
  it("unmatched tokens lower certainty and are reported", () => {
    const r = normalizeDays(["XYZ"]);
    expect(r.days).toHaveLength(0);
    expect(r.unmatched).toContain("XYZ");
    expect(r.certainty).toBeLessThan(1);
  });
  it("empty input yields no days but full certainty", () => {
    const r = normalizeDays([]);
    expect(r.days).toHaveLength(0);
    expect(r.certainty).toBe(1);
  });
});
