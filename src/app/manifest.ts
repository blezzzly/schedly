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
    // Standalone only, deliberately not fullscreen.
    //
    // Fullscreen was here to hide the black navigation bar Android draws below
    // a standalone app. It also hides the status bar, and that is the wrong
    // trade: on a phone the status bar is where the clock, the battery
    // percentage and the signal/Wi-Fi icons live. Losing those to remove a
    // cosmetic strip was a bad bargain, especially for an app whose whole point
    // is being useful when a connection is unreliable — that is exactly when you
    // want to see the Wi-Fi icon and the time.
    //
    // The nav bar is back as a result. If the black strip ever bothers anyone
    // again, `display_override: ["standalone"]` plus
    // `viewportFit: "cover"` already draws the app's safe-area padding under it
    // correctly, so it blends rather than overlapping.
    display_override: ["standalone"],
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    // Shortcuts are the long-press menu on an installed Android app. They point
    // at routes the service worker already precaches, so opening one from the
    // home screen works offline like any other screen — a shortcut to a route
    // that cannot load without a connection would be worse than no shortcut.
    shortcuts: [
      {
        name: "Today's schedule",
        short_name: "Today",
        url: "/dashboard",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Classes",
        short_name: "Classes",
        url: "/classes",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    icons: [
      // `any` first, then `maskable`. The maskable entry is the same artwork
      // with the safe zone already respected, because Android crops a maskable
      // icon to whatever shape the device's launcher uses and a circle-unsafe
      // icon loses its edges on a squircle.
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
