import { NextResponse } from "next/server";

/**
 * Reachability probe for the offline sync queue.
 *
 * The queue cannot use `navigator.onLine` to decide whether to replay: a phone
 * on a Wi-Fi network with no uplink, or on mobile data with no signal, reports
 * itself online the entire time. Acting on that flag fires a queue of requests
 * that are guaranteed to fail — the data and battery cost that Low Data Mode
 * exists to prevent.
 *
 * So the queue asks the server directly before it spends a request per queued
 * write. This endpoint has to stay as cheap as possible, because it is called
 * on every focus and every reconnect:
 *
 *  - No database, no session lookup, no third-party call. A probe that touches
 *    Postgres is a probe that can fail while the app itself is fine.
 *  - No authentication. The answer is the same for everyone; requiring a
 *    session would make the probe fail for a signed-out user and report a
 *    network problem that is really a login problem.
 *  - `no-store` at every layer. A cached 200 would defeat the entire point —
 *    the browser would answer from disk and report "online" with no network at
 *    all.
 *
 * The response body is a single field and nothing account-specific, so it
 * reveals nothing about the user to anything that can observe it.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        // A probe result must never be reused by an intermediary either.
        "CDN-Cache-Control": "no-store",
      },
    }
  );
}
