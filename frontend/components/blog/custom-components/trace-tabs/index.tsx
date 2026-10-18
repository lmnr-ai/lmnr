import { Children, isValidElement, type ReactNode } from "react";

import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";

import TraceTabsClient, { type TraceTabData } from "./trace-tabs-client";

interface TraceTabProps {
  label: string;
  traceId: string;
  children?: ReactNode;
}

// Blog traces always live in Laminar Cloud, so read them from its public
// shared-trace API rather than whatever DB this deployment is connected to.
const CLOUD_URL = "https://laminar.sh";
const FETCH_TIMEOUT_MS = 10_000;

// Marker only: TraceTabs reads its props, so it never renders on its own.
export function TraceTab(_: TraceTabProps) {
  return null;
}

const fetchCloud = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`${CLOUD_URL}${path}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    ...(process.env.NODE_ENV !== "production" ? { cache: "no-store" as const } : { next: { revalidate: 60 } }),
  });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return res.json() as Promise<T>;
};

const loadTab = async ({ label, traceId, children }: TraceTabProps): Promise<TraceTabData> => {
  // Anything other than a public trace (not shared, network error, bad id)
  // renders a placeholder instead of failing the post.
  const placeholder: TraceTabData = { label, traceId, description: children, trace: null, spans: [] };
  try {
    const id = encodeURIComponent(traceId);
    const [trace, spans] = await Promise.all([
      fetchCloud<TraceViewTrace>(`/api/shared/traces/${id}`),
      fetchCloud<TraceViewSpan[]>(`/api/shared/traces/${id}/spans`),
    ]);
    if (trace.visibility !== "public" || !Array.isArray(spans)) return placeholder;
    return { label, traceId, description: children, trace, spans };
  } catch (error) {
    console.error(`[TraceTabs] failed to load trace ${traceId}:`, error);
    return placeholder;
  }
};

export async function TraceTabs({ children }: { children: ReactNode }) {
  const tabs = Children.toArray(children)
    .filter(isValidElement<TraceTabProps>)
    .map((child) => child.props)
    .filter((props) => typeof props.traceId === "string");
  const loaded = await Promise.all(tabs.map(loadTab));
  return <TraceTabsClient tabs={loaded} />;
}
