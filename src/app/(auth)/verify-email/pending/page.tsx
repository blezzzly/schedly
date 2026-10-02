"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth-fetch";
import { Spinner } from "@/components/ui/spinner";

interface EmailProvider {
  app?: string;
  web: string;
}

// Each provider maps to both its native app URL scheme (for Capacitor/PWA so
// the mail app opens directly instead of the browser) and its web URL fallback.
const EMAIL_PROVIDERS: Record<string, EmailProvider> = {
  gmail: { app: "googlegmail://", web: "https://mail.google.com" },
  googlemail: { app: "googlegmail://", web: "https://mail.google.com" },
  outlook: { app: "ms-outlook://", web: "https://outlook.live.com" },
  hotmail: { app: "ms-outlook://", web: "https://outlook.live.com" },
  live: { app: "ms-outlook://", web: "https://outlook.live.com" },
  msn: { app: "ms-outlook://", web: "https://outlook.live.com" },
  yahoo: { app: "ymail://", web: "https://mail.yahoo.com" },
  proton: { app: "protonmail://", web: "https://mail.proton.me" },
  icloud: { web: "https://www.icloud.com/mail" },
  zoho: { web: "https://mail.zoho.com" },
  aol: { web: "https://mail.aol.com" },
  gmx: { web: "https://www.gmx.com" },
};

function getProvider(email: string): EmailProvider {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  const providerKey = (domain.split(".")[0] ?? "").toLowerCase();
  return EMAIL_PROVIDERS[providerKey] || { web: `https://${domain}` };
}

function openInbox(email: string) {
  const { app, web } = getProvider(email);
  if (app) {
    // Try the native mail app first. If the page is still visible after a beat,
    // the app wasn't installed / didn't handle the scheme, so fall back to web.
    window.location.href = app;
    setTimeout(() => {
      if (!document.hidden) {
        window.open(web, "_blank", "noopener,noreferrer");
      }
    }, 600);
  } else {
    window.open(web, "_blank", "noopener,noreferrer");
  }
}

function PendingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email") || "";
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await authFetch("/api/auth/get-session");
        const data = await res.json();
        if (data?.user?.emailVerified) {
          clearInterval(pollRef.current);
          setPolling(false);
          router.push("/onboarding");
        }
      } catch {
        // keep polling
      }
    }, 8000);

    return () => {
      clearInterval(pollRef.current);
    };
  }, [router]);

  const checkNow = async () => {
    try {
      const res = await authFetch("/api/auth/get-session");
      const data = await res.json();
      if (data?.user?.emailVerified) {
        router.push("/onboarding");
        return;
      }
    } catch { /* not yet */ }
    if (email) {
      openInbox(email);
    }
  };

  async function resendEmail() {
    if (!email) return;
    setLoading(true);
    try {
      await authClient.sendVerificationEmail({ email });
      setResent(true);
    } catch {
      // silent
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-[70dvh] items-center justify-center lg:min-h-0">
      <Card className="w-full border-border/50 shadow-lg shadow-primary/5">
      <CardHeader className="space-y-1 pb-6 text-center">
        <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <svg
            className="h-8 w-8 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">Verify your email</CardTitle>
        <p className="text-sm text-muted-foreground">
          A verification link has been sent to{" "}
          <a
            href={`mailto:${email}`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            {email}
          </a>
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground text-center leading-relaxed">
          Open the email and click the link to verify your account.
          The link expires in 24 hours.
        </p>
        {polling && (
          <p className="text-xs font-semibold text-center text-muted-foreground animate-pulse">
            Waiting for verification…
          </p>
        )}
        <Button
          variant="outline"
          className="w-full h-11 font-medium"
          onClick={checkNow}
        >
          I&apos;ve verified — check now
        </Button>
        {resent && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center dark:border-green-800 dark:bg-green-950">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Verification email resent!
            </p>
          </div>
        )}
        <Button
          variant="outline"
          className="w-full h-11 font-medium"
          onClick={resendEmail}
          disabled={loading || !email}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Spinner size={16} color="var(--primary)" />
              Sending...
            </span>
          ) : (
            "Resend verification email"
          )}
        </Button>
      </CardContent>
    </Card>
    </div>
  );
}

export default function VerifyEmailPendingPage() {
  return (
    <Suspense>
      <PendingContent />
    </Suspense>
  );
}
