import { type Metadata } from "next";
import { getServerSession } from "next-auth";

import LandingHeader from "@/components/landing/header";
import Pricing from "@/components/landing/pricing";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Transparent pricing for Laminar. Start free with generous limits, scale as your AI agents grow.",
  openGraph: {
    title: "Pricing - Laminar",
    description: "Transparent pricing for Laminar. Start free with generous limits, scale as your AI agents grow.",
    url: "https://laminar.sh/pricing",
    images: { url: "/opengraph-image.png", alt: "Laminar", width: 1200, height: 630 },
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing - Laminar",
    description: "Transparent pricing for Laminar. Start free with generous limits, scale as your AI agents grow.",
    images: { url: "/twitter-image.png", alt: "Laminar", width: 1200, height: 630 },
  },
};

export default async function PricingPage() {
  const session = await getServerSession(authOptions);

  return (
    <>
      <LandingHeader
        hasSession={session !== null && session !== undefined}
        isIncludePadding
        className="bg-landing-surface-800"
      />
      <Pricing />
    </>
  );
}
