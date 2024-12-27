import '@/app/globals.css';

import { Metadata } from 'next';
import dynamic from 'next/dynamic';

import { Toaster } from '@/components/ui/toaster';
import { sans } from '@/lib/fonts';
import { cn } from '@/lib/utils';

import { PHProvider } from './providers';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.lmnr.ai'),
  title: 'Laminar',
  openGraph: {
    type: 'website',
    title: 'Laminar',
    description: 'The AI engineering platform',
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

const PostHogPageView = dynamic(() => import('./posthog-pageview'), {
  ssr: false
});

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn('h-full antialiased', sans.variable)}>
      <PHProvider>
        <body
          className="flex flex-col h-full"
        >
          <PostHogPageView />
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
