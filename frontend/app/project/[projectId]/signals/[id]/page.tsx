import { type Metadata } from "next";

import Signal from "@/components/signal";

export const metadata: Metadata = {
  title: "Events",
};

export default async function SignalPage(props: { searchParams: Promise<{ traceId?: string; spanId?: string }> }) {
  const { traceId, spanId } = await props.searchParams;

  return <Signal spanId={spanId} traceId={traceId} />;
}
