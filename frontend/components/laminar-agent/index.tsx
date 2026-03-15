"use client";

import { Columns2, PanelRight } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header";

import AgentChatPanel from "./agent-chat-panel";
import { useLaminarAgentStore } from "./store";

export default function LaminarAgent() {
  const setViewMode = useLaminarAgentStore((s) => s.setViewMode);

  useEffect(() => {
    setViewMode("fullscreen");
    return () => {
      setViewMode("collapsed");
    };
  }, [setViewMode]);

  const header = (
    <Header path="laminar agent">
      <div className="flex items-center gap-1 ml-auto">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMode("floating")}>
          <Columns2 className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMode("sidebar")}>
          <PanelRight className="w-4 h-4" />
        </Button>
      </div>
    </Header>
  );

  return <AgentChatPanel header={header} />;
}
