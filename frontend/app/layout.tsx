import "@/app/globals.css";
import "@/app/scroll.css";

import { type Metadata } from "next";
import { type PropsWithChildren } from "react";

import { Toaster } from "@/components/ui/toaster";
import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";
import { manrope, sans, spaceGrotesk } from "@/lib/fonts";
import { cn } from "@/lib/utils";

import { PostHogProvider } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.lmnr.ai"),
  title: "Laminar",
  keywords: [
    "laminar",
    "evals",
    "label",
    "analyze",
    "ai",
    "eval",
    "llm ops",
    "observability",
    "openai",
    "llm",
    "llm observability",
  ],
  openGraph: {
    type: "website",
    title: "Laminar",
    description: "The AI engineering platform",
    siteName: "Laminar",
    images: {
      url: "/opengraph-image.png",
      alt: "Laminar",
    },
  },
  twitter: {
    card: "summary",
    description: "The AI engineering platform",
    title: "Laminar",
    images: {
      url: "/twitter-image.png",
      alt: "Laminar",
    },
  },
};

export default async function RootLayout({ children }: PropsWithChildren) {
  const telemetryEnabled = isFeatureEnabled(Feature.POSTHOG);

  return (
    <html
      lang="en"
      className={cn("h-full antialiased", sans.variable, manrope.variable, spaceGrotesk.variable)}
    >
      <PostHogProvider telemetryEnabled={telemetryEnabled}>
        <body className="flex flex-col h-full">
          <div className="flex">
            <div className="flex flex-col grow max-w-full min-h-screen">
              <main className="z-10 flex flex-col grow">{children}</main>
              <Toaster />
            </div>
          </div>
        </body>
      </PostHogProvider>
    </html>
  );
}
