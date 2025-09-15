"use client";

import React from "react";

import TraceView from "@/components/traces/trace-view";
import FiltersContextProvider from "@/components/ui/datatable-filter/context";
import Header from "@/components/ui/header";
import { Trace as TraceType } from "@/lib/traces/types";

const Trace = ({ trace }: { trace: TraceType }) => (
  <>
    <Header path={`traces/${trace.id}`} childrenContainerClassName="flex-1 mr-2" />
    <FiltersContextProvider>
      <TraceView propsTrace={trace} onClose={() => {}} traceId={trace.id} />
    </FiltersContextProvider>
  </>
);

export default Trace;
