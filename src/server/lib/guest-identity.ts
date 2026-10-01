/**
 * Guest identity primitives with NO imports of their own.
 *
 * Kept separate on purpose: `src/server/lib/auth.ts` needs `isGuestEmail` to
 * skip verification mail, and `guest.ts` needs the auth instance to mint a
 * session. If `isGuestEmail` lived in `guest.ts` those two modules would
 * import each other in a cycle, and the guest session creation would fail at
 * runtime with a partially-initialized module.
 */

/** Throwaway email domain for guest accounts. */
export const GUEST_EMAIL_DOMAIN = "guest.schedly.app";

/** True for the throwaway emails we mint for guests. */
export function isGuestEmail(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);
}
