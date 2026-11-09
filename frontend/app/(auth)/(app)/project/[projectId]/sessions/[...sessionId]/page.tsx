import { type Metadata } from "next";

import PageViewTracker from "@/components/common/page-view-tracker";
import Session from "@/components/traces/session";

const safeDecode = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

type Props = { params: Promise<{ projectId: string; sessionId: string[] }> };

const sessionIdOf = async ({ params }: Props) => (await params).sessionId.map(safeDecode).join("/");

// Next hands generateMetadata already-decoded segments (the page gets them encoded), so decoding again would
// corrupt an id that contains `%`.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Session ${(await params).sessionId.join("/")}` };
}

export default async function SessionPage(props: Props) {
  const decoded = await sessionIdOf(props);
  return (
    <>
      <PageViewTracker feature="sessions" properties={{ sessionId: decoded }} />
      <Session sessionId={decoded} />
    </>
  );
}
