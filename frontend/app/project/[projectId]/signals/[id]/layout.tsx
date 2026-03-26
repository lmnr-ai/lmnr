import { notFound } from "next/navigation";
import React, { type PropsWithChildren } from "react";

import { type EventsProps, SignalStoreProvider } from "@/components/signal/store.tsx";
import { getLastEvent, getSignal } from "@/lib/actions/signals";

const Layout = async (props: PropsWithChildren<{ params: Promise<{ projectId: string; id: string }> }>) => {
  const { projectId, id } = await props.params;

  const signal = (await getSignal({ projectId, id })) as EventsProps["signal"] | undefined;

  if (!signal) {
    return notFound();
  }

  const lastEvent = await getLastEvent({ projectId, signalId: signal.id });

  return (
    <>
      <SignalStoreProvider lastEvent={lastEvent} signal={signal}>
        {props.children}
      </SignalStoreProvider>
    </>
  );
};
export default Layout;
