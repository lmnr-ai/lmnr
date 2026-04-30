"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

import { bodyLarge, subsectionTitle } from "../../class-names";
import DocsButton from "../../docs-button";
import DesktopTree from "./desktop-tree";
import MobileBento from "./mobile-bento";

interface Props {
  className?: string;
}

const TRACE_ID = "3603700e-d02b-0c39-0f34-cfd20842c5ae";
const INITIAL_SPAN_ID = "00000000-0000-0000-edcc-7f0be2fb4397";

const DESKTOP_QUERY = "(min-width: 768px)";

const subscribeDesktop = (callback: () => void) => {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
};

const getDesktopSnapshot = () => window.matchMedia(DESKTOP_QUERY).matches;
const getDesktopServerSnapshot = (): boolean | undefined => undefined;

const ComposableTrace = ({ className }: Props) => {
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getDesktopServerSnapshot);

  if (isDesktop === undefined) return null;

  if (isDesktop) {
    return <DesktopTree className={className} traceId={TRACE_ID} initialSpanId={INITIAL_SPAN_ID} />;
  }

  return (
    <div className={cn("flex flex-col gap-8 items-start w-full", className)}>
      <div className="flex flex-col gap-1 items-start w-full">
        <h2 className={subsectionTitle}>Full context at a glance</h2>
        <p className={bodyLarge}>Tools to understand what your agent was doing and where it went wrong</p>
      </div>
      <MobileBento />
      <DocsButton href="https://laminar.sh/docs/tracing/introduction" />
    </div>
  );
};

export default ComposableTrace;
