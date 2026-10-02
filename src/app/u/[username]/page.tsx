import Image from "next/image";
import Link from "next/link";
// Imported from the local "use client" barrel, not straight from lucide-react —
// lucide calls createContext at module scope, which throws in a Server
// Component and breaks the production build. See ./icons.tsx.
import { GraduationCap, BookOpen, Award, MapPin } from "./icons";
import { getPublicProfile } from "@/app/(dashboard)/profile/public-actions";
import { Button } from "@/components/ui/button";
import { ProfileSheet } from "./sheet";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getPublicProfile(username);

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-foreground/70 bg-primary/10 text-4xl font-bold text-primary/50 shadow-[3px_3px_0_0_#401f32]">
          ?
        </div>
        <h1 className="mt-6 text-xl font-bold text-foreground">Profile not found</h1>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          We couldn&apos;t find a profile for @{username}.
        </p>
        <Link href="/" className="mt-6">
          <Button>Go to Schedly</Button>
        </Link>
      </div>
    );
  }

  const initials = (profile.firstName || "U").charAt(0).toUpperCase();
  const displayName = profile.lastName
    ? `${profile.firstName} ${profile.lastName}`
    : profile.firstName || profile.name;
  const isRemote =
    !!profile.avatarUrl &&
    profile.avatarUrl.startsWith("https") &&
    !profile.avatarUrl.startsWith("data:");
  const avatarSrc =
    !!profile.avatarUrl && profile.avatarUrl.startsWith("/")
      ? profile.avatarUrl
      : profile.avatarUrl;
  const yearLabel =
    profile.year != null
      ? `${profile.year}${
          profile.year % 100 >= 11 && profile.year % 100 <= 13
            ? "th"
            : ["st", "nd", "rd"][(profile.year % 10) - 1] || "th"
        } yr`
      : null;

  // A mini card: avatar, name, handle, and the wrapped info pills. The bordered
  // "Personal Details" table that used to be here is gone — it repeated the
  // pills three rows below and made a five-second glance at a shared profile
  // feel like a form to fill in. "Member since" and the "on Schedly" sign-off
  // went with it: both are noise on a link somebody opened to see a face and a
  // course.
  // Sized to its content (`size="auto"` on the sheet), so this is a compact card:
  // avatar, name, handle, pills, one button. Nothing here needs the height of a
  // full sheet, and a fixed-height one left the profile stranded at the top of a
  // mostly-empty screen.
  //
  // `pt-4 md:pt-6` is breathing room above the avatar. There was none, and on
  // desktop — where the drag handle is hidden — the picture sat flush against
  // the sheet's top border, which made the whole card look cramped and slightly
  // accidental.
  return (
    <>
      {/* Dot grid over the site-wide `--app-backdrop`. Without a texture, the
          space behind the sheet is one flat wash of colour and reads as an
          unfinished screen rather than a composed page. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: "var(--app-dot-grid)",
          backgroundSize: "var(--app-dot-size)",
        }}
      />
      <ProfileSheet>
      <div className="flex flex-col items-center px-6 pb-6 pt-4 text-center md:pt-6">
        <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-foreground/70 bg-card shadow-[3px_3px_0_0_#401f32]">
          {avatarSrc && !isRemote ? (
            <img
              src={avatarSrc}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          ) : avatarSrc && isRemote ? (
            <Image
              src={avatarSrc}
              alt={displayName}
              width={96}
              height={96}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/10 text-4xl font-bold text-primary">
              {initials}
            </div>
          )}
        </div>

        <h1 className="mt-4 text-xl font-bold text-foreground">{displayName}</h1>
        <p className="text-sm text-muted-foreground">@{profile.username}</p>

        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 pt-3">
          {profile.school && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5 text-primary" />
              <span className="max-w-[150px] truncate">{profile.school}</span>
            </div>
          )}
          {profile.course && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              <span>{profile.course}</span>
            </div>
          )}
          {yearLabel && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Award className="h-3.5 w-3.5 text-primary" />
              <span>{yearLabel}</span>
            </div>
          )}
          {profile.city && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span>{profile.city}</span>
            </div>
          )}
        </div>

        <Link href="/" className="mt-6 w-full">
          <Button className="w-full">Try Schedly now</Button>
        </Link>
      </div>
      </ProfileSheet>
    </>
  );
}
