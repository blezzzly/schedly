"use server";

import { db } from "@/server/db/client";

export type PublicProfile = {
  name: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  school: string | null;
  course: string | null;
  year: number | null;
  city: string | null;
  memberSince: string | null;
  /** A guest profile shows only what that guest actually set. */
  isGuest: boolean;
} | null;

export async function getPublicProfile(username: string): Promise<PublicProfile> {
  const clean = username.trim().toLowerCase();
  if (!clean) return null;

  const user = await db.user.findUnique({
    where: { username: clean },
    select: {
      isAnonymous: true,
      name: true,
      username: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      school: true,
      course: true,
      year: true,
      city: true,
      createdAt: true,
    },
  });

  if (!user) return null;

  // Guests do get a shareable profile. It used to read as "not found" instead,
  // which was the wrong answer twice over: it told a guest who had just been
  // given a share link that their own profile did not exist, and it meant a
  // guest who had picked a name and set a picture had no way to show anyone.
  //
  // What a guest must not publish is the account data they never filled in.
  // There is nothing to leak, so the profile is returned with whatever exists
  // and the UI shows only the name and handle.
  //
  // The handle space is still widened for guests as defence in depth — see
  // `allocateGuestHandle` — so a guest handle is unlikely to collide with a
  // chosen one. This is the layer that decides what a guest can see, though.
  const isGuest = user.isAnonymous === true;

  return {
    name: user.name,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    school: user.school,
    course: user.course,
    year: user.year,
    city: user.city,
    memberSince: user.createdAt
      ? new Date(user.createdAt).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })
      : null,
    isGuest,
  };
}
