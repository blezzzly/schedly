export async function retry<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; delayMs?: number }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 1;
  const delayMs = options?.delayMs ?? 1500;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isNetworkError =
        err instanceof TypeError ||
        (err instanceof Error &&
          (err.message === "Network error" ||
            err.message.includes("fetch") ||
            err.message.includes("network") ||
            err.name === "TypeError"));

      if (i < maxRetries && isNetworkError) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }

  throw new Error("unreachable");
}
