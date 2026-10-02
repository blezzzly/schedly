"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await forgotPassword(email.trim());
      if (result.error) {
        setError(result.error.message || "Something went wrong");
      } else {
        setSent(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Card className="border-border/50 shadow-lg shadow-primary/5">
        <CardHeader className="space-y-3 pb-4 text-center">
          <Link href="/" className="mx-auto flex items-center gap-2.5 self-start">
            <Image
              src="/images/logo.jpg"
              alt="Schedly"
              width={36}
              height={36}
              className="h-9 w-9 rounded-xl object-cover"
            />
            <span className="text-lg font-bold tracking-tight">Schedly</span>
          </Link>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">Check your email</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a password reset link to <strong>{email}</strong>.
              Click the link in your inbox to set a new password.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Link href="/login" className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
              Back to Login
            </Link>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setEmail("");
              }}
              className="block w-full text-sm text-muted-foreground hover:text-foreground"
            >
              Try a different email
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 shadow-lg shadow-primary/5">
        <CardHeader className="space-y-3 pb-4 text-center">
          <Link href="/" className="mx-auto flex items-center gap-2.5 self-start">
            <Image
              src="/images/logo.jpg"
              alt="Schedly"
              width={36}
              height={36}
              className="h-9 w-9 rounded-xl object-cover"
            />
            <span className="text-lg font-bold tracking-tight">Schedly</span>
          </Link>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">Forgot your password?</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
          </div>
        </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            autoFocus
          />

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-sm text-destructive text-center">{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
            {loading ? (
              <span className="flex items-center gap-2">
                <Spinner size={16} color="var(--secondary-foreground)" />
                Sending...
              </span>
            ) : (
              "Send Reset Link"
            )}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Back to Login
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
