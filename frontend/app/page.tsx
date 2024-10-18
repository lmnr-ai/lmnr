import Landing from '@/components/landing/landing';
import LandingHeader from '@/components/landing/landing-header';
import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { Metadata } from 'next';
import { Feature, isFeatureEnabled } from '@/lib/features/features';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Laminar',
  openGraph: {
    type: 'website',
    title: 'Laminar',
    description: 'Open-source Datadog + PostHog for complex LLM apps'
  },
  twitter: {
    card: 'summary',
    description: 'Open-source Datadog + PostHog for complex LLM apps',
    title: 'Laminar',
    images: {
      url: 'https://www.lmnr.ai/twitter-image.png',
      alt: 'Logo of Laminar - Open-source Datadog + PostHog for complex LLM apps'
    }
  }
};

export default async function LandingPage() {
  const session = await getServerSession(authOptions);

  if (!isFeatureEnabled(Feature.WORKSPACE)) {
    redirect('/projects');
  }


  return (
    <>
      <LandingHeader hasSession={session !== null && session !== undefined} />
      <Landing />
    </>
  );
}
