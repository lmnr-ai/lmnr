"use client";

import React, { useEffect, useState } from "react";

import { useDebuggerSessionStore } from "@/components/debugger-sessions/debugger-session-view/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import ConfigTab from "./config-tab";
import RunsTab from "./runs-tab";
import TracesTab from "./traces-tab";

interface DebuggerSidebarProps {
  onRun: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

type DebuggerSidebarTab = "config" | "runs" | "traces";

export default function DebuggerSidebar({ onRun, onCancel, isLoading }: DebuggerSidebarProps) {
  const sessionStatus = useDebuggerSessionStore((state) => state.sessionStatus);

  const [activeTab, setActiveTab] = useState<DebuggerSidebarTab>("config");

  const isRunning = sessionStatus === "RUNNING";

  useEffect(() => {
    if (isRunning) {
      setActiveTab("config");
    }
  }, [isRunning]);

  return (
    <div className="flex flex-col gap-1 flex-1 overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as DebuggerSidebarTab)}
        className="flex flex-col flex-1 overflow-hidden"
      >
        <div className="px-4 pt-4">
          <TabsList className="w-full">
            <TabsTrigger value="config" className="flex-1 text-xs">
              Run
            </TabsTrigger>
            <TabsTrigger disabled={isRunning} value="runs" className="flex-1 text-xs">
              Runs history
            </TabsTrigger>
            <TabsTrigger disabled={isRunning} value="traces" className="flex-1 text-xs">
              Run from trace
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="config" className="flex flex-col flex-1 overflow-hidden">
          <ConfigTab onRun={onRun} onCancel={onCancel} isLoading={isLoading} isActive={activeTab === "config"} />
        </TabsContent>

        <TabsContent value="runs" className="flex flex-col flex-1 overflow-hidden">
          <RunsTab />
        </TabsContent>

        <TabsContent value="traces" className="flex flex-col flex-1 overflow-hidden">
          <TracesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
