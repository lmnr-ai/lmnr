"use client";

import { AlertTriangle, CirclePlay, Loader, Loader2, Square } from "lucide-react";
import React from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  const { rolloutError, sessionStatus } = useRolloutSessionStoreContext((state) => ({
    rolloutError: state.rolloutError,
    sessionStatus: state.sessionStatus,
  }));

  const isRunning = sessionStatus === "RUNNING";
  const canRun = sessionStatus === "PENDING" || sessionStatus === "FINISHED" || sessionStatus === "STOPPED";

  useHotkeys(
    "meta+enter,ctrl+enter",
    () => {
      if (canRun && !isLoading) {
        onRollout();
      }
    },
    {
      enabled: !isRunning,
    },
    [isRunning, canRun, isLoading, onRollout]
  );

  return (
    <div className="flex flex-col gap-1 flex-1 overflow-hidden">
      <div className="flex flex-col gap-2 px-4 pt-4 pb-2">
        {isRunning ? (
          <Button className="w-fit" variant="destructive" onClick={onCancel} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" />
                Stopping...
              </>
            ) : (
              <>
                <Square size={14} className="mr-1.5" />
                <span className="mr-1.5">Stop</span>
                <Loader className="animate-spin w-4 h-4" />
              </>
            )}
          </Button>
        ) : (
          <Button className="w-fit" onClick={onRollout} disabled={isLoading || !canRun}>
            {isLoading ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <CirclePlay size={14} className="mr-1.5" />
                <span className="mr-1.5">Run</span>
                <kbd
                  data-slot="kbd"
                  className="inline-flex items-center justify-center px-1 font-sans text-xs font-medium select-none"
                >
                  ⌘ + ⏎
                </kbd>
              </>
            )}
          </Button>
        )}
        {rolloutError && (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{rolloutError}</AlertDescription>
          </Alert>
        )}
      </div>

      <Tabs defaultValue="config" className="flex flex-col flex-1 overflow-hidden px-4">
        <TabsList className="w-full">
          <TabsTrigger value="config" className="flex-1 text-xs">
            Config
          </TabsTrigger>
          <TabsTrigger value="runs" className="flex-1 text-xs">
            Runs
          </TabsTrigger>
          <TabsTrigger value="traces" className="flex-1 text-xs">
            Traces
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="flex flex-col flex-1 overflow-hidden">
          <ConfigTab />
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
