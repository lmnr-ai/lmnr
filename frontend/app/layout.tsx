import '@/app/globals.css';
import { sans, sans2 } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { Metadata } from 'next';
import { PHProvider } from './providers';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.lmnr.ai'),
  title: 'laminar'
};

const PostHogPageView = dynamic(() => import('./posthog-pageview'), {
  ssr: false
});

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  console.log(sans2.variable);
  return (
    <html lang="en" className={cn('h-full antialiased', sans.variable, sans2.variable)}>
      <PHProvider>
        <body
          className="flex flex-col h-full"
        >
          <PostHogPageView />
          <div className="flex">
            <div className="flex flex-col flex-grow min-h-screen max-w-full">
              <main className="z-10 flex flex-col flex-grow">{children}</main>
              <Toaster />
            </div>
          </div>
        </body>
      </PHProvider>
    </html>
  );
}
