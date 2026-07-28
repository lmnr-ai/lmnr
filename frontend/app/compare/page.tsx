import { type Metadata } from "next";

import PageViewTracker from "@/components/common/page-view-tracker";
import Compare from "@/components/landing/compare";
import { getServerSession } from "@/lib/auth-session";

const TITLE = "How Laminar compares";
const DESCRIPTION =
  "How Laminar is different from other AI agent observability and eval tools: a transcript debugger, Signals, automatic trace compression, and fully open-source SQL access.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: `${TITLE} - Laminar`,
    description: DESCRIPTION,
    url: "https://laminar.sh/compare",
    images: { url: "/opengraph-image.png", alt: "Laminar", width: 1200, height: 630 },
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} - Laminar`,
    description: DESCRIPTION,
    images: { url: "/twitter-image.png", alt: "Laminar", width: 1200, height: 630 },
  },
};

export default async function ComparePage() {
  const session = await getServerSession();

  return (
    <>
      <PageViewTracker feature="compare" action="page_viewed" />
      <Compare hasSession={session !== null && session !== undefined} />
    </>
  );
}
