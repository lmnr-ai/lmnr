import { type Metadata } from "next";
import { getServerSession } from "next-auth";

import Landing from "@/components/landing";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Laminar - Open-source observability for AI agents",
  description:
    "Open-source platform to trace, evaluate, and improve AI agents. Debug LLM calls, track tool use, and run evaluations on your AI applications.",
};

export default async function LandingPage() {
  const session = await getServerSession(authOptions);

  // TODO: reenable
  //if (!isFeatureEnabled(Feature.LANDING)) {
  //  if (!session) {
  //    redirect("/sign-in");
  //  } else {
  //    redirect("/projects");
  //  }
  //}
  //
  //if (session) {
  //  redirect("/projects");
  //}

  return <Landing hasSession={session !== null && session !== undefined} />;
}

