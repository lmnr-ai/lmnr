import '@/app/globals.css';
import { fontMono, fontSans } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.lmnr.ai'),
  title: 'laminar',
}


export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body
        className={cn(
          'flex flex-col h-full font-sans antialiased',
          fontSans.variable,
          fontMono.variable
        )}
      >
        <div className="flex">
          <div className="flex flex-col flex-grow min-h-screen max-w-full">
            <main className="z-10 flex flex-col flex-grow">{children}</main>
            <Toaster />
          </div>
        </div>
      </body>
    </html>
  );
}
