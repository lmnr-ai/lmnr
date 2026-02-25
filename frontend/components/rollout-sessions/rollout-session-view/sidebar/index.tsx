"use client";

import React, { useEffect, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useRolloutSessionStoreContext } from "../rollout-session-store";
import ConfigTab from "./config-tab";
import RunsTab from "./runs-tab";
import TracesTab from "./traces-tab";

interface RolloutSidebarProps {
  onRollout: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function RolloutSidebar({ onRollout, onCancel, isLoading }: RolloutSidebarProps) {
  const sessionStatus = useRolloutSessionStoreContext((state) => state.sessionStatus);

  const [activeTab, setActiveTab] = useState("config");

  const isRunning = sessionStatus === "RUNNING";

  useEffect(() => {
    if (isRunning) {
      setActiveTab("config");
    }
  }, [isRunning]);

  return (
    <div className="flex flex-col gap-1 flex-1 overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden px-4 pt-4">
        <TabsList className="w-full">
          <TabsTrigger value="config" className="flex-1 text-xs">
            Config
          </TabsTrigger>
          <TabsTrigger disabled={isRunning} value="runs" className="flex-1 text-xs">
            Runs
          </TabsTrigger>
          <TabsTrigger disabled={isRunning} value="traces" className="flex-1 text-xs">
            Traces
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="flex flex-col flex-1 overflow-hidden">
          <ConfigTab
            onRollout={onRollout}
            onCancel={onCancel}
            isLoading={isLoading}
            isActive={activeTab === "config"}
          />
        </TabsContent>

        <TabsContent value="runs" className="flex flex-col flex-1 overflow-hidden py-2">
          <RunsTab />
        </TabsContent>

        <TabsContent value="traces" className="flex flex-col flex-1 overflow-hidden py-2">
          <TracesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
