"use server";

import { auth } from "@/server/lib/auth";
import { headers } from "next/headers";
import { checkRateLimitDb } from "@/server/lib/security";
import {
  generateScheduleSuggestions,
  type ScheduleSuggestionInput,
} from "@/server/lib/ai";

export type AiInsightsResult =
  | { success: true; suggestions: string[] }
  | { success: false; error: string };

// Paid AI calls are a DoS/cost target, so the number of insight generations
// per user is capped (in-memory — see security.ts for the serverless caveat).
const AI_INSIGHTS_MAX = 10;
const AI_INSIGHTS_WINDOW_MS = 60 * 60 * 1000;

export async function getAiInsights(
  classes: ScheduleSuggestionInput[],
): Promise<AiInsightsResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  if (!Array.isArray(classes) || classes.length === 0) {
    return { success: false, error: "Add a schedule first" };
  }

  const rate = await checkRateLimitDb(
    `ai-insights:${session.user.id}`,
    AI_INSIGHTS_MAX,
    AI_INSIGHTS_WINDOW_MS,
  );
  if (!rate.allowed) {
    return {
      success: false,
      error: "You've used your free insight generations for this hour. Try again later.",
    };
  }

  try {
    const suggestions = await generateScheduleSuggestions(classes);
    return { success: true, suggestions };
  } catch (err) {
    console.error("[AI_INSIGHTS]", err);
    return { success: false, error: "Could not generate insights. Please try again." };
  }
}
