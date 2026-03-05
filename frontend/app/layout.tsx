import "@/app/globals.css";
import "@/app/scroll.css";

import { type Metadata } from "next";
import { headers } from "next/headers";
import { type PropsWithChildren } from "react";

import { Toaster } from "@/components/ui/toaster";
import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";
import { manrope, sans, spaceGrotesk } from "@/lib/fonts";
import { cn } from "@/lib/utils";

import { PostHogProvider } from "./providers";

const OGPLUS_BASE_URL = "https://orxlznqh.ogplus.net";
const DEFAULT_OG_IMAGE = "https://laminar.sh/opengraph-image.png";

const shouldUseOgPlus = (pathname: string) => {
  if (pathname === "/") {
    return true;
  }
  const prefixes = ["/blog", "/pricing", "/support", "/policies", "/checkout", "/sign-in", "/sign-up"];
  return prefixes.some((prefix) => pathname.startsWith(prefix));
};

export const generateMetadata = async (): Promise<Metadata> => {
  const headerStore = await headers();
  const pathname = headerStore.get("x-invoke-path") ?? "/";
  const ogImage = shouldUseOgPlus(pathname) ? `${OGPLUS_BASE_URL}${pathname}` : DEFAULT_OG_IMAGE;
  const canonicalUrl = `https://laminar.sh${pathname}`;

  return {
    metadataBase: new URL("https://laminar.sh"),
    title: "Laminar",
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
      title: "Laminar",
      description: "Understand why your agent failed. Iterate fast to fix it.",
      siteName: "Laminar",
      url: canonicalUrl,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      description: "Understand why your agent failed. Iterate fast to fix it.",
      title: "Laminar",
      images: [ogImage],
    },
  };
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
