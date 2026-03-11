import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import React, { type PropsWithChildren } from "react";

import { SignalStoreProvider } from "@/components/signal/store.tsx";
import { getLastEvent, getSignal, type Signal } from "@/lib/actions/signals";
import { EVENTS_TRACE_VIEW_WIDTH } from "@/lib/actions/traces";

const Layout = async (props: PropsWithChildren<{ params: Promise<{ projectId: string; id: string }> }>) => {
  const { projectId, id } = await props.params;

  let signal: Signal | undefined;
  try {
    signal = (await getSignal({ projectId, id })) as Signal | undefined;
  } catch {
    throw new Error("Failed to load signal");
  }

  if (!signal) {
    return notFound();
  }

  let lastEvent;
  try {
    lastEvent = await getLastEvent({ projectId, signalId: signal.id });
  } catch {
    lastEvent = undefined;
  }

  const cookieStore = await cookies();
  const traceViewWidthCookie = cookieStore.get(EVENTS_TRACE_VIEW_WIDTH);
  const initialTraceViewWidth = traceViewWidthCookie ? parseInt(traceViewWidthCookie.value, 10) : undefined;

  return (
    <>
      <SignalStoreProvider lastEvent={lastEvent} initialTraceViewWidth={initialTraceViewWidth} signal={signal}>
        {props.children}
      </SignalStoreProvider>
    </>
  );
};
export default Layout;
