"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

function VerifyHandler() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error"
  );
  const [error, setError] = useState(
    token ? "" : "No verification token found."
  );

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    authClient
      .verifyEmail({ query: { token } })
      .then(() => {
        if (!cancelled) {
          setStatus("success");
          window.location.href = "/onboarding";
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus("error");
          setError(err?.message || "Verification failed. The link may have expired.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        {status === "loading" && (
          <>
            <div className="mx-auto mb-4 flex justify-center">
              <Spinner size={40} color="var(--foreground)" />
            </div>
            <CardTitle className="text-xl">Verifying your email...</CardTitle>
          </>
        )}
        {status === "success" && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <CardTitle className="text-xl text-primary">Email verified!</CardTitle>
            <CardDescription>Setting up your profile...</CardDescription>
          </>
        )}
        {status === "error" && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <CardTitle className="text-xl">Verification failed</CardTitle>
            <CardDescription>{error}</CardDescription>
          </>
        )}
      </CardHeader>
    </Card>
  );
}

export default function VerifyEmailTokenPage() {
  return (
    <Suspense>
      <div className="w-full max-w-md">
        <VerifyHandler />
      </div>
    </Suspense>
  );
}
