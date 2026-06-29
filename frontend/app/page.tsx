import { type Metadata } from "next";
import { redirect } from "next/navigation";

import Landing from "@/components/landing";
import { getServerSession } from "@/lib/auth-session";
import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";
import { ogImage } from "@/lib/metadata";

export const metadata: Metadata = {
  title: { absolute: "Laminar - Open-source observability for AI agents" },
  description:
    "Open-source platform to trace, evaluate, and improve AI agents. Debug LLM calls, track tool use, and run evaluations on your AI applications.",
  openGraph: {
    title: "Laminar - Open-source observability for AI agents",
    description:
      "Open-source platform to trace, evaluate, and improve AI agents. Debug LLM calls, track tool use, and run evaluations on your AI applications.",
    url: "https://laminar.sh",
    images: [ogImage],
  },
  twitter: {
    title: "Laminar - Open-source observability for AI agents",
    description:
      "Open-source platform to trace, evaluate, and improve AI agents. Debug LLM calls, track tool use, and run evaluations on your AI applications.",
    images: [ogImage],
  },
};

export default async function LandingPage() {
  const session = await getServerSession();

  if (!isFeatureEnabled(Feature.LANDING)) {
    if (!session) {
      redirect("/sign-in");
    } else {
      redirect("/projects");
    }
  }

  if (session) {
    redirect("/projects");
  }

  return <Landing hasSession={session !== null && session !== undefined} />;
}
