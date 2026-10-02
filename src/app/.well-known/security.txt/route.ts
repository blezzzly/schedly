import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  // Read from the environment rather than hard-coded, so this file does not need
  // an edit every time the origin changes. The previous values pointed at a
  // custom domain and a repository that is no longer this project's origin.
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://schedlyapp.vercel.app").replace(
    /\/+$/,
    ""
  );
  const repo = process.env.SECURITY_REPO || "blezzzly/schedly";

  const contact = process.env.SECURITY_CONTACT || `https://github.com/${repo}/security/advisories/new`;
  const text = [
    "Contact: " + contact,
    "Policy: https://github.com/" + repo + "/security/policy",
    "Preferred-Languages: en",
    "Canonical: " + origin + "/.well-known/security.txt",
    "Expires: " + new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  ].join("\n");

  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
    },
  });
}
