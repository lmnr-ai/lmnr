"use client";

import { Columns2, PanelRight } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header";

import AgentChatPanel from "./agent-chat-panel";
import { type AgentViewMode, useLaminarAgentStore } from "./store";

export default function LaminarAgent() {
  const setViewMode = useLaminarAgentStore((s) => s.setViewMode);
  const router = useRouter();
  const { projectId } = useParams();

  useEffect(() => {
    setViewMode("fullscreen");
    return () => {
      setViewMode("collapsed");
    };
  }, [setViewMode]);

  const switchModeAndNavigateAway = useCallback(
    (mode: AgentViewMode) => {
      setViewMode(mode);
      router.push(`/project/${projectId}/traces`);
    },
    [setViewMode, router, projectId]
  );

  const header = (
    <Header path="laminar agent">
      <div className="flex items-center gap-1 ml-auto">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Floating mode"
          onClick={() => switchModeAndNavigateAway("floating")}
        >
          <Columns2 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Sidebar mode"
          onClick={() => switchModeAndNavigateAway("sidebar")}
        >
          <PanelRight className="w-4 h-4" />
        </Button>
      </div>
    </Header>
  );

  return <AgentChatPanel header={header} />;
}
