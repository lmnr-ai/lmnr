"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";

import { signalTabSearch } from "@/components/signal/hooks/signal-tab-search";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { track } from "@/lib/posthog";

export type SignalPageTab = "clusters" | "runs" | "settings";

const TABS: { value: SignalPageTab; label: string }[] = [
  { value: "clusters", label: "Events" },
  { value: "runs", label: "Runs" },
  { value: "settings", label: "Settings" },
];

interface Props {
  signalId: string;
  active: SignalPageTab;
}

/** Events | Runs | Settings under the breadcrumb. Events (the clusters view) is the default, so it has no `tab` param. */
export default function SignalPageTabs({ signalId, active }: Props) {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const onChange = (value: string) => {
    const tab = value as SignalPageTab;
    const next = signalTabSearch(searchParams.toString(), tab);
    if (tab === "clusters") next.delete("tab");
    track("signals", "tab_viewed", { signalId, tab });
    // Every tab lives on the signal's own route; Clusters then opens its default cluster.
    router.push(`/project/${projectId}/signals/${signalId}?${next.toString()}`);
  };

  return (
    <Tabs value={active} onValueChange={onChange} className="ml-5 flex-none">
      <TabsList size="sm">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
