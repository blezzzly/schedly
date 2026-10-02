import { NextResponse } from "next/server";
import { getVapidPublicKey, isVapidConfigured } from "@/server/lib/web-push";

const PUBLIC_CACHE = "public, max-age=86400, s-maxage=86400";

export function GET() {
  if (!isVapidConfigured()) {
    return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  }
  return NextResponse.json(
    { publicKey: getVapidPublicKey() },
    { headers: { "Cache-Control": PUBLIC_CACHE } }
  );
}