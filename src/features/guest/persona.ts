/**
 * Guest personas — the fun, human-facing half of an anonymous account.
 *
 * Client-safe on purpose: the onboarding sheet rolls a name here so it can
 * re-shuffle instantly on dice taps without a round-trip. The server
 * re-validates the name against this same list before storing it, so the
 * client can't stuff anything arbitrary into a user row.
 */

/**
 * Real given names from all over the world, so a rolled guest reads like a
 * person's handle rather than a cartoon pet. Mixed origins on purpose — the
 * pick is a coin flip across every country, which is also the point: nobody can
 * infer anything from it.
 */
export const GUEST_NAMES = [
  // Philippines
  "Juan", "Maria", "Andres", "Camila", "Rafael",
  // Japan
  "Hiroshi", "Yuki", "Sakura", "Kenji", "Aoi",
  // Korea
  "Minjun", "Seoyeon", "Jihoon", "Hana",
  // China
  "Wei", "Mei", "Chen", "Xin",
  // India / Nepal
  "Ravi", "Priya", "Aditi", "Dinesh", "Anika",
  // Nigeria / Ghana
  "Kwame", "Amara", "Kofi", "Adaeze", "Thabo",
  // Middle East
  "Hassan", "Fatima", "Omar", "Nour", "Tariq",
  // Eastern Europe
  "Nikolai", "Olga", "Pawel", "Marta", "Zoltan",
  // Western Europe
  "Lars", "Ingrid", "Sofia", "Mateo", "Chiara",
  // Nordics / Netherlands
  "Sanne", "Ilke", "Elias", "Freja",
  // Latin America
  "Diego", "Valentina", "Santiago", "Camilo",
  // South / Southeast Asia
  "Bao", "Arif", "Nurul", "Somchai",
  // Africa
  "Sekou", "Zainab", "Chidi", "Aisha", "Yusuf",
  // Middle East / Caucasus
  "Levan", "Narine", "Ruslan",
  // Mediterranean / misc
  "Elena", "Giulia", "Andreas", "Leila", "Tarek",
] as const;

export type GuestName = (typeof GUEST_NAMES)[number];

/** True when `value` is one of the names we're willing to store. */
export function isGuestName(value: unknown): value is GuestName {
  return typeof value === "string" && (GUEST_NAMES as readonly string[]).includes(value);
}

/**
 * Deterministically pick a name from a seed, so the sheet and the server
 * agree on what's shown without the server having to echo it back.
 */
export function pickGuestName(seed: string): GuestName {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return GUEST_NAMES[Math.abs(hash) % GUEST_NAMES.length]!;
}

/** A fresh seed for a new roll. */
export function newGuestSeed(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
}
