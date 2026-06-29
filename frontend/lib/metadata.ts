export const SITE_URL = "https://laminar.sh";
export const SITE_NAME = "Laminar";

// Shared 1200x630 social card (public/opengraph-image.png), used as the default
// OG/Twitter image across pages. Next.js overwrites the whole openGraph object
// per segment, so any page that sets its own openGraph must re-reference this.
export const ogImage = {
  url: "/opengraph-image.png",
  alt: "Laminar - Open-source observability for long-running agents",
  width: 1200,
  height: 630,
};
