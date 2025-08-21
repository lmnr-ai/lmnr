import '@/app/globals.css';

import { Metadata } from 'next';
import { Suspense } from 'react';

import { Toaster } from '@/components/ui/toaster';
import { manrope,sans } from '@/lib/fonts';
import { cn } from '@/lib/utils';

import PostHogPageView from './posthog-pageview';
import { PHProvider } from './providers';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.lmnr.ai'),
  title: 'Laminar',
  keywords: ['laminar', 'evals', 'label', 'analyze', 'ai', 'eval', 'llm ops', 'observability', 'openai', 'llm', 'llm observability'],
  openGraph: {
    type: 'website',
    title: 'Laminar',
    description: 'The AI engineering platform',
    siteName: 'Laminar',
    images: {
      url: '/opengraph-image.png',
      alt: 'Laminar'
    }
  },
  twitter: {
    card: 'summary',
    description: 'The AI engineering platform',
    title: 'Laminar',
    images: {
      url: '/twitter-image.png',
      alt: 'Laminar'
    }
  }
};

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn('h-full antialiased', sans.variable, manrope.variable)}>
      <PHProvider>
        <body
          className="flex flex-col h-full"
        >
          <Suspense fallback={null}>
            <PostHogPageView />
          </Suspense>
          <div className="flex">
            <div className="flex flex-col flex-grow max-w-full min-h-screen">
              <main className="z-10 flex flex-col flex-grow">{children}</main>
              <Toaster />
            </div>
          </div>
        </body>
      </PHProvider>
    </html>
  );
}
