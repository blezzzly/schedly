import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/server/lib/security";

const publicRoutes = ["/login", "/register", "/forgot-password", "/reset-password", "/", "/u"];
const publicApiRoutes = ["/api/auth", "/api/version", "/api/push", "/api/notifications", "/api/cron", "/api/upload", "/api/reminders/fire"];
const verificationRoutes = ["/verify-email"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const method = request.method;
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateCheck = checkRateLimit(`global:${ip}:${method}`, 30, 10_000);
    if (!rateCheck.allowed) {
      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Try again later." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const isPublicApi = publicApiRoutes.some((route) => pathname.startsWith(route));
  if (isPublicApi) return NextResponse.next();

  const isVerification = verificationRoutes.some((route) => pathname.startsWith(route));
  const isPublic = publicRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"));

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie && !isPublic && !isVerification) {
    if (pathname.startsWith("/api/")) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (sessionCookie && (pathname === "/" || pathname === "/login" || pathname === "/register" || pathname === "/forgot-password")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|uploads|offline.html|sw.js|manifest.webmanifest|.*\\.(?:jpg|jpeg|png|gif|svg|webp|ico)).*)",
  ],
};
