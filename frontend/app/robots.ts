import { type MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/project/", "/checkout/", "/onboarding"],
    },
    sitemap: "https://laminar.sh/sitemap.xml",
  };
}
