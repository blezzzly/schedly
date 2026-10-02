"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera, Sparkles } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { authClient } from "@/lib/auth-client";
import { uploadAvatar, removeAvatar } from "@/app/(dashboard)/settings/actions";
import { PermissionsStep } from "./permissions-step";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { authFetch } from "@/lib/auth-fetch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type UserWithExtras = {
  username?: string;
  firstName?: string;
  lastName?: string;
  image?: string;
  avatarUrl?: string;
} & Record<string, unknown>;

export default function OnboardingPage() {
  const { user, isLoading, refetchSession } = useAuth();
  const u = user as UserWithExtras | null;
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2>(1);
  const [avatarUrl, setAvatarUrl] = useState<string | null>((u?.image as string) || (u?.avatarUrl as string) || null);
  const [avatarError, setAvatarError] = useState(false);
  const displayAvatar = avatarError ? null : avatarUrl;
  // Determine if the avatar is a remote URL that next/image can optimize.
  // Vercel Blob URLs and absolute https URLs are supported.
  // data: URLs and blob: URLs must use <img> directly.
  const isRemoteAvatar =
    displayAvatar && displayAvatar.startsWith("http") && !displayAvatar.startsWith("data:") && !displayAvatar.startsWith("blob:");

  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [username, setUsername] = useState<string>((u?.username as string) || "");
  const [usernameError, setUsernameError] = useState("");

  const firstName = u?.firstName || "User";
  const initials = firstName.charAt(0).toUpperCase();

  const markComplete = async () => {
    if (finishing) return;
    setFinishing(true);
    const retries = 3;
    for (let i = 0; i < retries; i++) {
      try {
        await authClient.updateUser({
          onboardingCompleted: true,
        } as Parameters<typeof authClient.updateUser>[0]);
      } catch {
        /* try again */
      }
      // Refresh the session so the dashboard layout sees onboarding is done and
      // doesn't redirect straight back here. Bypass the cookie cache so we read
      // the updated value from the DB, not the stale cached session.
      await refetchSession({ query: { disableCookieCache: true } });
      try {
        const res = await authFetch("/api/auth/get-session?disableCookieCache=true");
        const data = await res.json();
        const updated = data?.user as
          | { onboardingCompleted?: boolean }
          | null
          | undefined;
        if (updated?.onboardingCompleted) {
          router.push("/dashboard");
          return;
        }
      } catch {
        /* try again */
      }
    }
    setFinishing(false);
  };

  const handleContinue = async () => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) {
      setUsernameError("Don't forget your username.");
      return;
    }
    setUsernameError("");
    if (trimmed !== u?.username) {
      const res = await authClient.updateUser({
        username: trimmed,
      } as Parameters<typeof authClient.updateUser>[0]);
      if (res.error) {
        setUsernameError("That username is already taken. Try another.");
        return;
      }
      refetchSession();
    }
    setStep(2);
  };

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadAvatar(fd);
      if ("url" in result) {
        setAvatarUrl(result.url);
        setAvatarDialogOpen(false);
        refetchSession();
      }
    } catch {
      /* keep current avatar */
    }
    setUploading(false);
    e.target.value = "";
  }

  async function handleRemoveAvatar() {
    if (removing) return;
    setRemoving(true);
    try {
      const result = await removeAvatar();
      if ("ok" in result) {
        setAvatarUrl(null);
        setAvatarDialogOpen(false);
        refetchSession();
      }
    } catch {
      /* keep current avatar */
    }
    setRemoving(false);
  }

  const handleAvatarClick = () => {
    if (uploading) return;
    if (avatarUrl) {
      setAvatarDialogOpen(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
      return;
    }
    if (
      !isLoading &&
      user &&
      (user as { onboardingCompleted?: boolean } | null)?.onboardingCompleted
    ) {
      router.replace("/dashboard");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="animate-pulse text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center p-5">
      <div className="w-full max-w-md">
        {/* Top bar: logo */}
        <div className="mb-8 flex items-center">
          <div className="flex items-center gap-2.5">
            <Image src="/images/logo.jpg" alt="" aria-hidden width={40} height={40} className="h-10 w-10 rounded-xl object-cover" />
            <span className="text-lg font-bold tracking-tight text-foreground">Schedly</span>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-6 flex items-center gap-2">
          {[1, 2].map((s) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s === step ? "bg-primary" : s < step ? "bg-primary/40" : "bg-border"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-8">
              <div className="mb-7 flex flex-col items-center text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </span>
                <h1 className="text-xl font-bold tracking-tight text-foreground">Set up your profile</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a photo and pick a username so friends can find you.
                </p>
              </div>

              {/* Avatar */}
              <div className="mb-6 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={uploading}
                  className="group relative h-24 w-24 overflow-hidden rounded-full ring-2 ring-border/40 transition-shadow hover:ring-primary/40"
                >
                  {displayAvatar ? isRemoteAvatar ? (
                    <Image
                      src={displayAvatar}
                      alt="Profile avatar"
                      fill
                      className="object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={displayAvatar} alt="Profile avatar" onError={() => setAvatarError(true)} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-primary/10 text-3xl font-semibold text-primary">
                      {initials}
                    </span>
                  )}
                  <span
                    className={`absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity ${
                      uploading ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {uploading ? (
                      <Spinner size={20} color="white" />
                    ) : (
                      <Camera className="h-6 w-6 text-white" />
                    )}
                  </span>
                </button>
                <p className="text-xs text-muted-foreground">
                  {avatarUrl ? "Tap to change or remove your photo" : "Add a profile photo (optional)"}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
              </div>

              {/* Username */}
              <div className="space-y-2">
                <label
                  htmlFor="username"
                  className="text-sm font-medium text-foreground"
                >
                  Username
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    @
                  </span>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""));
                      setUsernameError("");
                    }}
                    aria-invalid={!!usernameError}
                    autoComplete="off"
                    className={cn(
                      "flex h-10 w-full min-w-0 rounded-lg border border-input bg-transparent pl-7 pr-3 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
                    )}
                  />
                </div>
                {usernameError && <p className="text-xs text-destructive">{usernameError}</p>}
              </div>

              <Button
                className="mt-6 h-12 w-full font-semibold"
                onClick={handleContinue}
              >
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-8">
              <div className="mb-7 flex flex-col items-center text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </span>
                <h1 className="text-xl font-bold tracking-tight text-foreground">You&apos;re almost there</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Optional — set it up now or skip, you can change it later.
                </p>
              </div>

              <PermissionsStep
                onComplete={markComplete}
                finishing={finishing}
                buttonLabel="Get started"
              />
            </CardContent>
          </Card>
        )}

        {/* Avatar popup: view / change / remove the profile photo */}
        <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle className="text-center">Profile photo</DialogTitle>
              <DialogDescription className="text-center">
                View your photo or pick a new one.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4">
              {avatarUrl ? isRemoteAvatar ? (
                <Image
                  src={avatarUrl}
                  alt="Profile avatar"
                  width={144}
                  height={144}
                  className="h-36 w-36 rounded-full object-cover ring-2 ring-border/40"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="Profile avatar"
                  className="h-36 w-36 rounded-full object-cover ring-2 ring-border/40"
                />
              ) : null}
            </div>
            <DialogFooter className="flex-row justify-center gap-2 sm:justify-center">
              <Button
                variant="outline"
                className="h-10 flex-1"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "Uploading..." : "Change photo"}
              </Button>
              {avatarUrl && (
                <Button
                  variant="destructive"
                  className="h-10 flex-1"
                  disabled={removing}
                  onClick={handleRemoveAvatar}
                >
                  {removing ? "Removing..." : "Remove photo"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
