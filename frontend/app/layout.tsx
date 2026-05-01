import "@/app/globals.css";
import "@/app/scroll.css";

import { type Metadata } from "next";
import { getServerSession } from "next-auth";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type PropsWithChildren } from "react";

import { Toaster } from "@/components/ui/toaster";
import { type FeatureFlags, FeatureFlagsProvider } from "@/contexts/feature-flags-context";
import { authOptions } from "@/lib/auth";
import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";
import { manrope, sans, spaceGrotesk } from "@/lib/fonts";
import { PostHogProvider } from "@/lib/posthog";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  metadataBase: new URL("https://laminar.sh"),
  title: {
    default: "Laminar - Open-source observability for long-running agents",
    template: "%s | Laminar",
  },
  description:
    "Open-source platform to trace, evaluate, and improve AI agents. Debug LLM calls, track tool use, and run evaluations on your AI applications.",
  keywords: [
    "laminar",
    "evals",
    "label",
    "analyze",
    "ai",
    "ai agent",
    "eval",
    "llm ops",
    "ai ops",
    "observability",
    "tracing",
    "ai sdk tracing",
    "ai tracing",
    "llm",
    "llm observability",
    "ai observability",
    "agent observability",
    "ai agent observability",
    "ai agent tracing",
    "ai agent evals",
    "ai agent evaluation",
  ],
  openGraph: {
    type: "website",
    title: "Laminar - Open-source observability for long-running agents",
    description:
      "Open-source platform to trace, evaluate, and improve AI agents. Debug LLM calls, track tool use, and run evaluations on your AI applications.",
    siteName: "Laminar",
    images: {
      url: "/opengraph-image.png",
      alt: "Laminar - Open-source observability for long-running agents",
      width: 1200,
      height: 630,
    },
  },
  twitter: {
    card: "summary_large_image",
    title: "Laminar - Open-source observability for long-running agents",
    description:
      "Open-source platform to trace, evaluate, and improve AI agents. Debug LLM calls, track tool use, and run evaluations on your AI applications.",
    images: {
      url: "/twitter-image.png",
      alt: "Laminar - Open-source observability for long-running agents",
      width: 1200,
      height: 630,
    },
  },
};

export default async function RootLayout({ children }: PropsWithChildren) {
  const featureFlags = Object.fromEntries(Object.values(Feature).map((f) => [f, isFeatureEnabled(f)])) as FeatureFlags;

  const posthogEnabled = featureFlags[Feature.POSTHOG];
  const session = posthogEnabled ? await getServerSession(authOptions).catch(() => null) : null;
  const email = session?.user?.email ?? undefined;

  const body = (
    <body className="flex flex-col h-full">
      <NuqsAdapter>
        <div className="flex">
          <div className="flex flex-col grow max-w-full min-h-screen">
            <main className="z-10 flex flex-col grow">{children}</main>
            <Toaster />
          </div>
        </div>
      </NuqsAdapter>
    </body>
  );

  return (
    <html lang="en" className={cn("h-full antialiased", sans.variable, manrope.variable, spaceGrotesk.variable)}>
      <FeatureFlagsProvider flags={featureFlags}>
        {posthogEnabled ? (
          <PostHogProvider telemetryEnabled email={email}>
            {body}
          </PostHogProvider>
        ) : (
          body
        )}
      </FeatureFlagsProvider>
    </html>
  );
}
