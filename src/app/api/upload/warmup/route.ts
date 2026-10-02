import { NextResponse } from "next/server";
import { auth } from "@/server/lib/auth";
import { warmupOcr, isOcrWarm } from "@/server/lib/ocr-warmup";

export const runtime = "nodejs";
export const maxDuration = 60;

async function ensureAuth(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { error: null };
}

export async function POST(request: Request) {
  const { error } = await ensureAuth(request.headers);
  if (error) return error;

  if (isOcrWarm()) {
    return NextResponse.json({ warm: true, status: "already-warm" });
  }

  try {
    await warmupOcr();
    return NextResponse.json({ warm: true, status: "warmed" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Warmup failed";
    return NextResponse.json({ warm: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { error } = await ensureAuth(request.headers);
  if (error) return error;

  return NextResponse.json({ warm: isOcrWarm() });
}