import { type NextRequest, NextResponse } from "next/server";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  // Bounded read so the endpoint can't be used to spam the logs with
  // arbitrarily large payloads.
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: true }, { status: 413 });
  }
  try {
    const report = JSON.parse(text);
    const cspReport = report?.["csp-report"] ?? report;
    const effective = typeof cspReport?.["effective-directive"] === "string" ? cspReport["effective-directive"] : "unknown";
    const blocked = typeof cspReport?.["blocked-uri"] === "string" ? cspReport["blocked-uri"].slice(0, 200) : "unknown";
    console.warn(`[CSP_VIOLATION] ${effective} blocked ${blocked}`);
  } catch {
    console.warn("[CSP_VIOLATION] Invalid report received");
  }
  return NextResponse.json({ ok: true });
}
