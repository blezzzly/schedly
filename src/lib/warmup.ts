let warmed = false;

export function warmup() {
  if (warmed || typeof window === "undefined") return;
  warmed = true;

  const urls = ["/api/version"];

  for (const url of urls) {
    setTimeout(() => {
      fetch(url, { method: "HEAD", cache: "no-store" }).catch(() => {});
    }, 100);
  }
}
