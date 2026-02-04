import { type Metadata } from "next";

import Signal from "@/components/signal";

export const metadata: Metadata = {
  title: "Events",
};

export default async function SignalPage(props: { searchParams: Promise<{ traceId?: string }> }) {
  const { traceId } = await props.searchParams;

  return <Signal traceId={traceId} />;
}
