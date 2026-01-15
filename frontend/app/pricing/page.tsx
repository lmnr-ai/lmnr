import { Metadata } from "next";
import { getServerSession } from "next-auth";

import LandingHeader from "@/components/Landing/header";
import Pricing from "@/components/Landing/pricing";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Pricing – Laminar",
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
