import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import LandingHeader from '@/components/landing/landing-header';
import { Metadata } from 'next';
import Pricing from '@/components/landing/pricing';

export const metadata: Metadata = {
  title: 'Pricing – Laminar'
};

export default async function PricingPage() {
  const session = await getServerSession(authOptions);

  return (
    <>
      <LandingHeader hasSession={session !== null && session !== undefined} />
      <Pricing />
    </>
  );
}
