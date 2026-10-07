import { notFound } from "next/navigation";
import React, { type PropsWithChildren } from "react";

import { type EventsProps, SignalStoreProvider } from "@/components/signal/store.tsx";
import { getSignal } from "@/lib/actions/signals";

const Layout = async (props: PropsWithChildren<{ params: Promise<{ projectId: string; signalId: string }> }>) => {
  const { projectId, signalId } = await props.params;

  const signal = (await getSignal({ projectId, id: signalId })) as EventsProps["signal"] | undefined;

  if (!signal) {
    return notFound();
  }

  return (
    <>
      <SignalStoreProvider signal={signal}>{props.children}</SignalStoreProvider>
    </>
  );
};
export default Layout;
