"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { type TaskSetTab, useTaskSetTab } from "./state";

/** Tasks | Versions | Runs | Agent scripts switch of a task set. */
export default function TaskSetTabs() {
  const [tab, setTab] = useTaskSetTab();
  return (
    <Tabs value={tab} onValueChange={(v) => void setTab(v as TaskSetTab)}>
      <TabsList size="sm">
        <TabsTrigger value="tasks">Tasks</TabsTrigger>
        <TabsTrigger value="versions">Versions</TabsTrigger>
        <TabsTrigger value="runs">Runs</TabsTrigger>
        <TabsTrigger value="scripts">Agent scripts</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
