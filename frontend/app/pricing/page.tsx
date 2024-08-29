import LandingHeader from "@/components/landing/landing-header";
import Pricing from "@/components/landing/pricing";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";

export default async function PricingPage() {
  const session = await getServerSession(authOptions);

  return (
    <>
      <LandingHeader hasSession={session !== null && session !== undefined} />
      <Pricing />
    </>
  );
}