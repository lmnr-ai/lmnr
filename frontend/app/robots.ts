import { type MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/project/", "/checkout/", "/onboarding"],
    },
    // The docs are served by Mintlify under /docs and publish their own sitemap.
    // robots.txt is only read at the origin root, so the copy Mintlify writes to
    // /docs/robots.txt never reaches a crawler. Declare that sitemap here instead.
    sitemap: ["https://laminar.sh/sitemap.xml", "https://laminar.sh/docs/sitemap.xml"],
  };
}
