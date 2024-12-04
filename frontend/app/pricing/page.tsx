import { Metadata } from 'next';
import { getServerSession } from 'next-auth';

import LandingHeader from '@/components/landing/landing-header';
import Pricing from '@/components/landing/pricing';
import { authOptions } from '@/lib/auth';

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
