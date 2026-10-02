const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;

export async function verifyTurnstile(token: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true;
  if (!token) return false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token }),
        signal: controller.signal,
      });
      const data = await res.json();
      return data.success === true;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return false;
  }
}
