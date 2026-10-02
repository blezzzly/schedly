import { SUBJECT_COLORS } from "@/lib/constants";

let colorIndex = 0;
const colorMap = new Map<string, string>();

export function getSubjectColor(subject: string): string {
  const normalized = subject.toLowerCase().trim();
  if (colorMap.has(normalized)) {
    return colorMap.get(normalized)!;
  }
  const color = SUBJECT_COLORS[colorIndex % SUBJECT_COLORS.length]!;
  colorMap.set(normalized, color);
  colorIndex++;
  return color;
}

export function resetColorAssignments(): void {
  colorIndex = 0;
  colorMap.clear();
}
