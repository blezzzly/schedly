import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guest-account AI allowance.
 *
 * The unit under test is `consumeGuestAiAllowance`, which is the single place
 * that decides whether a guest may spend an AI generation. `db` is mocked so
 * no test touches the real database, and `crypto.randomUUID` is stubbed for
 * the id-suffix helper.
 */

const findUnique = vi.fn();
const updateMany = vi.fn();

vi.mock("@/server/db/client", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
  },
}));

const { consumeGuestAiAllowance, GuestAiLimitError, GUEST_AI_LIMIT } = await import("./guest");
const { isGuestEmail } = await import("./guest-identity");

beforeEach(() => {
  findUnique.mockReset();
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
});

describe("isGuestEmail", () => {
  it("matches the throwaway guest domain", () => {
    expect(isGuestEmail("guest-abc123@guest.schedly.app")).toBe(true);
    expect(isGuestEmail("GUEST-ABC@GUEST.SCHEDLY.APP")).toBe(true);
  });

  it("does not match a real address", () => {
    expect(isGuestEmail("me@gmail.com")).toBe(false);
    expect(isGuestEmail("guest.schedly.app@evil.com")).toBe(false);
  });

  it("handles null/undefined", () => {
    expect(isGuestEmail(null)).toBe(false);
    expect(isGuestEmail(undefined)).toBe(false);
  });
});

describe("consumeGuestAiAllowance", () => {
  it("does nothing for a real (non-guest) user", async () => {
    findUnique.mockResolvedValue({ isAnonymous: false, guestAiUsed: 0 });

    await expect(consumeGuestAiAllowance("real-user")).resolves.toBeUndefined();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("does nothing for a user that no longer exists", async () => {
    findUnique.mockResolvedValue(null);

    await expect(consumeGuestAiAllowance("ghost")).resolves.toBeUndefined();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("charges a guest who is still under the limit", async () => {
    findUnique.mockResolvedValue({ isAnonymous: true, guestAiUsed: 0 });

    await expect(consumeGuestAiAllowance("guest-1")).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "guest-1", guestAiUsed: { lt: GUEST_AI_LIMIT } },
      data: { guestAiUsed: { increment: 1 } },
    });
  });

  it("throws once the guest is out of tries", async () => {
    findUnique.mockResolvedValue({
      isAnonymous: true,
      guestAiUsed: GUEST_AI_LIMIT,
    });

    await expect(consumeGuestAiAllowance("guest-1")).rejects.toThrow(GuestAiLimitError);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("carries the sentinel code friendlyError() looks for", async () => {
    findUnique.mockResolvedValue({
      isAnonymous: true,
      guestAiUsed: GUEST_AI_LIMIT,
    });

    await expect(consumeGuestAiAllowance("guest-1")).rejects.toThrow(
      /GUEST_AI_LIMIT_REACHED/,
    );
  });

  it("uses a conditional update so parallel requests can't both overshoot", async () => {
    findUnique.mockResolvedValue({ isAnonymous: true, guestAiUsed: GUEST_AI_LIMIT - 1 });

    await consumeGuestAiAllowance("guest-1");

    const args = updateMany.mock.calls[0]![0] as { where: { guestAiUsed: { lt: number } } };
    expect(args.where.guestAiUsed.lt).toBe(GUEST_AI_LIMIT);
  });
});
