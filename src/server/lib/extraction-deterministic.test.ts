import { describe, it, expect } from "vitest";
import { normalizeTime } from "./extraction-deterministic";

describe("normalizeTime", () => {
  it("passes through valid 24-hour HH:MM", () => {
    expect(normalizeTime("07:30")).toBe("07:30");
    expect(normalizeTime("23:45")).toBe("23:45");
    expect(normalizeTime("00:00")).toBe("00:00");
  });

  it("pads hours missing a leading zero", () => {
    expect(normalizeTime("7:30")).toBe("07:30");
    expect(normalizeTime("9:05")).toBe("09:05");
  });

  it("converts 12-hour AM/PM times exactly", () => {
    expect(normalizeTime("07:30 AM")).toBe("07:30");
    expect(normalizeTime("7:30am")).toBe("07:30");
    expect(normalizeTime("12:00 AM")).toBe("00:00");
    expect(normalizeTime("01:30 PM")).toBe("13:30");
    expect(normalizeTime("12:00 PM")).toBe("12:00");
    expect(normalizeTime("1:30pm")).toBe("13:30");
    expect(normalizeTime("11:59 pm")).toBe("23:59");
  });

  it("leaves unparseable input unchanged", () => {
    expect(normalizeTime("o'clock")).toBe("o'clock");
    expect(normalizeTime("")).toBe("");
    expect(normalizeTime(null)).toBe("");
  });
});