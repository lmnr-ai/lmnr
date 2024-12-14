import '@/app/globals.css';

import { Metadata } from 'next';
import { Suspense } from 'react';

import { Toaster } from '@/components/ui/toaster';
import { sans } from '@/lib/fonts';
import { cn } from '@/lib/utils';

import PostHogPageView from './posthog-pageview';
import { PHProvider } from './providers';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.lmnr.ai'),
  title: 'laminar'
};

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
