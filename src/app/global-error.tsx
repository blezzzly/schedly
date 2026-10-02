"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100dvh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            fontFamily: "system-ui, -apple-system, sans-serif",
            backgroundColor: "#ffffff",
            color: "#1a1416",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 448,
              borderRadius: 16,
              border: "1px solid rgba(0,0,0,0.08)",
              padding: "2rem",
              textAlign: "center",
              boxShadow: "0 8px 40px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 800,
                color: "#fff",
                margin: "0 auto 1.25rem",
                background:
                  "linear-gradient(135deg, var(--primary, #ec4899), color-mix(in srgb, var(--primary, #ec4899) 60%, #a21caf))",
                boxShadow: "0 12px 30px color-mix(in srgb, var(--primary, #ec4899) 30%, transparent)",
              }}
            >
              !
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
              Something went wrong
            </h1>
            <p
              style={{
                maxWidth: 360,
                fontSize: 14,
                lineHeight: 1.6,
                color: "#71717a",
                margin: "0.5rem auto 0",
              }}
            >
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={() => unstable_retry()}
              style={{
                border: 0,
                borderRadius: 12,
                padding: "0.75rem 2rem",
                fontSize: 14,
                fontWeight: 600,
                color: "#fff",
                marginTop: "1.5rem",
                cursor: "pointer",
                transition: "opacity 150ms ease",
                background:
                  "linear-gradient(135deg, var(--primary, #ec4899), color-mix(in srgb, var(--primary, #ec4899) 60%, #a21caf))",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
