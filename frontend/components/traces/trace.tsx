"use client";

import React from "react";

import TraceView from "@/components/traces/trace-view";
import { TraceViewTrace } from "@/components/traces/trace-view/trace-view-store.tsx";
import FiltersContextProvider from "@/components/ui/datatable-filter/context";
import Header from "@/components/ui/header";

const Trace = ({ trace }: { trace: TraceViewTrace }) => (
  <>
    <Header path={`traces/${trace.id}`} childrenContainerClassName="flex-1 mr-2" />
    <FiltersContextProvider>
      <TraceView propsTrace={trace} onClose={() => {}} traceId={trace.id} />
    </FiltersContextProvider>
  </>
);

export default Trace;
