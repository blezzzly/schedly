export async function isPasswordBreached(password: string): Promise<number> {
  const hash = await sha1(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5).toUpperCase();

  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
  if (!res.ok) return 0;

  const text = await res.text();
  for (const line of text.split("\n")) {
    const [hashSuffix, count] = line.split(":");
    if (hashSuffix?.trim().toUpperCase() === suffix) {
      return parseInt(count || "0", 10);
    }
  }
  return 0;
}

async function sha1(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const buffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
