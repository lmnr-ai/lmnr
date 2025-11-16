"use client";

import React from "react";

import TraceView from "@/components/traces/trace-view";
import { TraceViewTrace } from "@/components/traces/trace-view/trace-view-store.tsx";
import Header from "@/components/ui/header";
import FiltersContextProvider from "@/widgets/ui/infinite-datatable/ui/datatable-filter/context";

const Trace = ({ trace }: { trace: TraceViewTrace }) => (
  <>
    <Header path={`traces/${trace.id}`} childrenContainerClassName="flex-none mr-2 h-12" />
    <div className="grow border-t" />
    <FiltersContextProvider>
      <TraceView propsTrace={trace} onClose={() => {}} traceId={trace.id} />
    </FiltersContextProvider>
  </>
);

export default Trace;
