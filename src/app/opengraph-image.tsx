import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

export const alt = "Schedly — Your class schedule, automatically organized";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background:
            "radial-gradient(circle at 50% -20%, rgba(236,72,153,0.55), transparent 70%), linear-gradient(140deg, #1d1124 0%, #2a1430 55%, #34121f 100%)",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 36,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 22,
              background: "linear-gradient(135deg, #ec4899, #a21caf)",
              color: "white",
              fontSize: 36,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            S
          </div>
          <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
            Schedly
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "0 96px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 68,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: -2,
            }}
          >
            Your class schedule,{" "}
            <span style={{ color: "#f472b6" }}>automatically organized.</span>
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 28,
              color: "rgba(255,255,255,0.78)",
            }}
          >
            {siteConfig.description}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}