import { DesktopLanding } from "@/components/landing/desktop-landing";
import { MobileOnboarding } from "@/components/landing/mobile-onboarding";
import { SessionRedirect } from "@/features/auth/components/session-redirect";

export default function Home() {
  return (
    <>
      {/* Offline: the SW serves this cached page and the middleware can't
          run, so a signed-in user would land on the landing page and look
          logged out. SessionRedirect sends them to /dashboard instead. */}
      <SessionRedirect />
      {/* Desktop landing (>=768px) — unchanged */}
      <div className="hidden md:block">
        <DesktopLanding />
      </div>
      {/* Mobile onboarding (<768px) — native app-style flow */}
      <div className="block md:hidden">
        <MobileOnboarding />
      </div>
    </>
  );
}
