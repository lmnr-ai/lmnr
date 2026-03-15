"use client";

import { Columns2, Maximize, Minus, PanelRight, Sparkles } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { type AgentViewMode, useLaminarAgentStore } from "./store";

interface AgentModeHeaderProps {
  currentMode: AgentViewMode;
}

export default function AgentModeHeader({ currentMode }: AgentModeHeaderProps) {
  const setViewMode = useLaminarAgentStore((s) => s.setViewMode);
  const router = useRouter();
  const { projectId } = useParams();

  const goFullscreen = () => {
    setViewMode("fullscreen");
    router.push(`/project/${projectId}/agent`);
  };

  return (
    <div className="flex items-center justify-between flex-none h-10 w-full px-3 border-b">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Laminar Agent</span>
      </div>
      <div className="flex items-center gap-0.5">
        {currentMode === "sidebar" && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMode("collapsed")}>
              <Minus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMode("floating")}>
              <Columns2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goFullscreen}>
              <Maximize className="w-4 h-4" />
            </Button>
          </>
        )}
        {currentMode === "floating" && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMode("collapsed")}>
              <Minus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMode("sidebar")}>
              <PanelRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goFullscreen}>
              <Maximize className="w-4 h-4" />
            </Button>
          </>
        )}
        {currentMode === "fullscreen" && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMode("floating")}>
              <Columns2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMode("sidebar")}>
              <PanelRight className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
