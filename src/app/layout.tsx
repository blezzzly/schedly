import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { siteConfig } from "@/config/site";
import { Warmup } from "@/components/warmup";
import { InstallPrompt } from "@/components/install-prompt";
import { PushForegroundListener } from "@/components/push-foreground-listener";
import { DevSwCleanup } from "@/components/dev-sw-cleanup";
import { ThemeProvider } from "@/features/theme";
import { Toaster } from "sonner";
import "ldrs/react/JellyTriangle.css";
import "ldrs/react/ChaoticOrbit.css";
import "../bones/registry";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Schedly — AI-Powered Student Planner",
    template: "%s · Schedly",
  },
  description: siteConfig.description,
  applicationName: "Schedly",
  keywords: [
    "student planner",
    "class schedule",
    "timetable",
    "AI schedule",
    "college planner",
    "school app",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    siteName: "Schedly",
    title: "Schedly — AI-Powered Student Planner",
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Schedly — AI-Powered Student Planner",
    description: siteConfig.description,
  },
  icons: {
    icon: "/images/logo.jpg",
    apple: "/images/logo.jpg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Schedly",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1416" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialThemeId = cookieStore.get("schedly-theme")?.value;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta
          name="google-site-verification"
          content="IO2A9lf6gXvDGTZN9Lc6hj6Zk1WIoDqojV9OJgCyjC4"
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/* Soft Morning Mist background — one layer behind the whole site */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0"
          style={{
            backgroundImage: "var(--app-backdrop)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
          }}
        />
        <div className="relative z-10 flex min-h-full flex-1 flex-col safe-area-content">
          <Warmup />
          <InstallPrompt />
          <PushForegroundListener />
          <DevSwCleanup />
          <ThemeProvider initialThemeId={initialThemeId}>{children}</ThemeProvider>
          <Toaster position="top-right" richColors />
        </div>
      </body>
    </html>
  );
}
