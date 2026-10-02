"use client";

import { Turnstile } from "@marsidev/react-turnstile";

export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;

  return (
    <div className="pointer-events-none relative">
      <div className="pointer-events-auto">
        <Turnstile
          siteKey={siteKey}
          onSuccess={onToken}
          options={{
            theme: "light",
            size: "normal",
          }}
        />
      </div>
    </div>
  );
}
