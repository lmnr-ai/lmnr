import { type Metadata } from "next";
import { redirect } from "next/navigation";

import Landing from "@/components/landing";
import { getServerSession } from "@/lib/auth-session";
import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";
import { description,ogImage, title } from "@/lib/metadata";

export const metadata: Metadata = {
  title: { absolute: title },
  description: description,
  openGraph: {
    title: title,
    description: description,
    url: "https://laminar.sh",
    images: [ogImage],
  },
  twitter: {
    title: title,
    description: description,
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
