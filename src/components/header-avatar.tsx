"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";

// Inline profile avatar shown at the start of page headers (main pages).
// On desktop it opens /settings?tab=account (profile info lives there).
// On mobile it opens /profile which renders a full-screen bottom sheet.
export function HeaderAvatar() {
  const router = useRouter();
  const { user } = useAuth();

  const u = user as
    | { firstName?: string; image?: string; avatarUrl?: string }
    | null
    | undefined;
  const initials = (u?.firstName || "U").charAt(0).toUpperCase();
  const rawAvatar = u?.image || u?.avatarUrl || null;
  // Ensure avatar URL is absolute for Capacitor/PWA origins.
  const avatar =
    rawAvatar &&
    !rawAvatar.startsWith("data:") &&
    !rawAvatar.startsWith("http") &&
    rawAvatar.startsWith("/")
      ? `${typeof window !== "undefined" ? window.location.origin : ""}${rawAvatar}`
      : rawAvatar;
  // Determine if the avatar is a remote URL that next/image can optimize.
  // Vercel Blob URLs and absolute https URLs are supported.
  // data: URLs, relative paths, blob: URLs, and local upload API URLs must use <img> directly.
  const isRemoteAvatar =
    avatar &&
    avatar.startsWith("https") &&
    !avatar.startsWith("data:") &&
    !avatar.startsWith("blob:") &&
    !avatar.includes("/api/upload/");

  function handleClick() {
    // Both desktop and mobile go to /profile — the page adapts:
    // mobile shows a bottom sheet, desktop shows a full-page card.
    router.push("/profile");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Open profile"
      className="hidden shrink-0 overflow-hidden rounded-xl border-2 border-foreground/70 bg-card shadow-[3px_3px_0_0_#401f32] transition-transform duration-200 hover:scale-105 active:scale-95 md:block"
    >
      {avatar ? isRemoteAvatar ? (
        <Image
          src={avatar}
          alt={initials}
          width={40}
          height={40}
          className="h-10 w-10 rounded-lg object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt={initials}
          className="h-10 w-10 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground">
          {initials}
        </div>
      )}
    </button>
  );
}
