"use server";

import { verifyTurnstile } from "@/server/lib/turnstile";

export async function verifyCaptcha(token: string): Promise<{ success: boolean }> {
  const ok = await verifyTurnstile(token);
  return { success: ok };
}
