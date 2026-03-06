"use client";

import React from "react";

import TraceView from "@/components/traces/trace-view";
import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import Header from "@/components/ui/header";

const Trace = ({ trace }: { trace: TraceViewTrace }) => (
  <>
    <Header path={`traces/${trace.id}`} childrenContainerClassName="flex-none mr-2 h-10" />
    <div className="flex-1 min-h-0 flex">
      <TraceView propsTrace={trace} onClose={() => {}} traceId={trace.id} />
    </div>
  </>
);

export default Trace;
