import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import Landing from '@/components/landing/landing';
import LandingHeader from '@/components/landing/landing-header';
import { authOptions } from '@/lib/auth';
import { Feature, isFeatureEnabled } from '@/lib/features/features';


export const metadata: Metadata = {
  title: 'Laminar',
  openGraph: {
    type: 'website',
    title: 'Laminar',
    description: 'AI engineering from first principles'
  },
  twitter: {
    card: 'summary',
    description: 'AI engineering from first principles',
    title: 'Laminar',
    images: {
      url: 'https://www.lmnr.ai/twitter-image.png',
      alt: 'Laminar logo'
    }
  }
};

export default async function LandingPage() {
  const session = await getServerSession(authOptions);

  if (!isFeatureEnabled(Feature.WORKSPACE)) {
    if (!session) {
      redirect('/sign-in');
    } else {
      redirect('/projects');
    }
  }

  return (
    <>
      <LandingHeader hasSession={session !== null && session !== undefined} />
      <Landing />
    </>
  );
}
