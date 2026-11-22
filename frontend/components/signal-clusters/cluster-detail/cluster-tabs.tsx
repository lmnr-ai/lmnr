"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["report", "events"] as const;
export type ClusterTab = (typeof TABS)[number];

export const useClusterTab = () => useQueryState("clusterTab", parseAsStringLiteral(TABS).withDefault("report"));

/** Report | Events switch above the selected cluster. */
export default function ClusterTabs() {
  const [tab, setTab] = useClusterTab();
  return (
    <Tabs value={tab} onValueChange={(v) => void setTab(v as ClusterTab)}>
      <TabsList size="sm">
        <TabsTrigger value="report">Report</TabsTrigger>
        <TabsTrigger value="events">Events</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
