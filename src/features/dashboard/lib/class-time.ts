// Class times are stored as UTC hours so they render identically everywhere;
// all formatting below works directly on the stored Date objects.

export function toMin(d: Date) {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function fmtCountdown(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatClockTime(d: Date) {
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h < 12 ? "AM" : "PM";
  h = h % 12 === 0 ? 12 : h % 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatTimeRange(start: Date, end: Date) {
  return `${formatClockTime(start)} – ${formatClockTime(end)}`;
}
