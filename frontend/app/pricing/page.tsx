import { type Metadata } from "next";

import { LANDING_COLUMN_MAX_W } from "@/components/landing/class-names";
import LandingHeader from "@/components/landing/header";
import Pricing from "@/components/landing/pricing";
import { getServerSession } from "@/lib/auth-session";
import { ogImage, SITE_URL } from "@/lib/metadata";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Transparent pricing for Laminar. Start free with generous limits, scale as your AI agents grow.",
  openGraph: {
    title: "Pricing - Laminar",
    description: "Transparent pricing for Laminar. Start free with generous limits, scale as your AI agents grow.",
    url: `${SITE_URL}/pricing`,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing - Laminar",
    description: "Transparent pricing for Laminar. Start free with generous limits, scale as your AI agents grow.",
    images: [ogImage],
  },
};

export default async function PricingPage() {
  const session = await getServerSession();

  return (
    <div className="bg-surface-700 flex flex-col w-full min-h-screen">
      <LandingHeader
        hasSession={session !== null && session !== undefined}
        isIncludePadding
        className={cn("w-full mx-auto pt-4 px-6 lg:px-0", LANDING_COLUMN_MAX_W)}
      />
      <Pricing />
    </div>
  );
}
