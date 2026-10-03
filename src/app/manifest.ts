import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Schedly — Smart Schedule Management",
    short_name: "Schedly",
    description:
      "Snap a photo of your class schedule — Schedly extracts, organizes, and reminds you automatically.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Ordered fullscreen first because Chrome takes the first entry it
    // supports. In plain standalone mode Android keeps its navigation bar drawn
    // below the app, which is the black strip at the bottom of the screen;
    // fullscreen is what removes it and matches how other installed apps on the
    // device behave. "standalone" stays in the list as the fallback for
    // platforms with no fullscreen support.
    //
    // Note this hides the status bar too. Drop "fullscreen" from this array to
    // get the status bar back and the navigation bar with it.
    display_override: ["fullscreen", "standalone"],
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
