import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/classes",
        "/todo",
        "/notifications",
        "/pomodoro",
        "/notes",
        "/gwa",
        "/upload",
        "/design",
        "/settings",
        "/feedback",
        "/admin",
        "/onboarding",
        "/verify",
        "/forgot-password",
      ],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}