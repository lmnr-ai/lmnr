"use client";

import { GanttChart, List } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useTraceDiffStore } from "../trace-diff-store";

const ViewModeToggle = () => {
  const { viewMode, setViewMode, rightTrace } = useTraceDiffStore((s) => ({
    viewMode: s.viewMode,
    setViewMode: s.setViewMode,
    rightTrace: s.rightTrace,
  }));

  if (!rightTrace) return null;

  return (
    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "list" | "timeline")}>
      <TabsList className="h-7">
        <TabsTrigger value="list" className="text-xs">
          <List className="size-3" />
          List
        </TabsTrigger>
        <TabsTrigger value="timeline" className="text-xs">
          <GanttChart className="size-3" />
          Timeline
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
};

export default ViewModeToggle;
