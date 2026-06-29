import "@/app/globals.css";
import "@/app/scroll.css";

import { type Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type PropsWithChildren } from "react";

import BasePathFetchShim from "@/components/common/base-path-fetch-shim";
import { Toaster } from "@/components/ui/toaster";
import { type FeatureFlags, FeatureFlagsProvider } from "@/contexts/feature-flags-context";
import { getServerSession } from "@/lib/auth-session";
import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";
import { manrope, sans, sansLanding } from "@/lib/fonts";
import { ogImage } from "@/lib/metadata";
import { PostHogProvider } from "@/lib/posthog";
import { cn } from "@/lib/utils";

const title = "Laminar - Open-source observability for AI agents";
// Keep <= 125 chars: social previews truncate og:description around there.
const description =
  "Open-source platform to trace, evaluate, and debug AI agents. Monitor LLM calls, tool use, and run evals on your apps.";

export const metadata: Metadata = {
  metadataBase: new URL("https://laminar.sh"),
  title: {
    default: title,
    template: "%s | Laminar",
  },
  description,
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
    title,
    description,
    siteName: "Laminar",
    url: "https://laminar.sh",
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImage],
  },
};

export default async function RootLayout({ children }: PropsWithChildren) {
  const featureFlags = Object.fromEntries(Object.values(Feature).map((f) => [f, isFeatureEnabled(f)])) as FeatureFlags;

  const posthogEnabled = featureFlags[Feature.POSTHOG];
  const session = posthogEnabled ? await getServerSession().catch(() => null) : null;
  const email = session?.user?.email ?? undefined;

  const body = (
    <body className="flex flex-col h-full">
      <BasePathFetchShim />
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
    <html lang="en" className={cn("h-full antialiased", sans.variable, manrope.variable, sansLanding.variable)}>
      <FeatureFlagsProvider flags={featureFlags}>
        <PostHogProvider telemetryEnabled={posthogEnabled} email={email}>
          {body}
        </PostHogProvider>
      </FeatureFlagsProvider>
    </html>
  );
}
