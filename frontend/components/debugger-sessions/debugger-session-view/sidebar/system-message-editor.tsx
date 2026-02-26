"use client";

import { RotateCcw } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useDebuggerSessionStore } from "../store";
import { type SystemMessage } from "../system-messages-utils";

interface SystemMessageEditorProps {
  message: SystemMessage;
}

export default function SystemMessageEditor({ message }: SystemMessageEditorProps) {
  const { projectId, id: sessionId } = useParams<{ projectId: string; id: string }>();

  const { overrideContent, isEnabled, generatedName, toggleOverride, updateOverride, resetOverride, setGeneratedName } =
    useDebuggerSessionStore((state) => ({
      overrideContent: state.overrides[message.pathKey]?.system,
      isEnabled: state.isOverrideEnabled(message.id),
      generatedName: state.generatedNames[message.pathKey],
      toggleOverride: state.toggleOverride,
      updateOverride: state.updateOverride,
      resetOverride: state.resetOverride,
      setGeneratedName: state.setGeneratedName,
    }));

  const currentContent = overrideContent ?? message.content;
  const [localContent, setLocalContent] = useState(currentContent);
  const [isNameLoading, setIsNameLoading] = useState(false);

  useEffect(() => {
    setLocalContent(currentContent);
  }, [currentContent]);

  useEffect(() => {
    if (!message.content || generatedName) return;

    let cancelled = false;

    const generateName = async () => {
      setIsNameLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/debugger-sessions/${sessionId}/generate-name`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ promptContent: message.content }),
        });

        if (!res.ok) return;

        const data = (await res.json()) as { name: string };
        if (!cancelled) {
          setGeneratedName(message.pathKey, data.name);
        }
      } catch {
        // Fall back to showing the path
      } finally {
        if (!cancelled) setIsNameLoading(false);
      }
    };

    generateName();

    return () => {
      cancelled = true;
    };
  }, [message.content, message.pathKey, generatedName, projectId, sessionId, setGeneratedName]);

  const isModified = isEnabled && overrideContent !== undefined && overrideContent !== message.content;

  const handleBlur = () => {
    if (isEnabled && localContent !== currentContent) {
      updateOverride(message.pathKey, localContent);
    }
  };

  const handleReset = () => {
    setLocalContent(message.content);
    resetOverride(message.id);
  };

  const handleToggle = () => {
    if (!isEnabled) {
      setLocalContent(message.content);
    }
    toggleOverride(message.id);
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-card transition-all overflow-hidden divide-y",
        isEnabled && "border-primary/50 ring-1 ring-primary/20"
      )}
    >
      <div className="flex items-center justify-between px-2 bg-muted/30">
        <div className="flex items-center gap-2 truncate overflow-x-auto no-scrollbar py-2">
          {isNameLoading ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs font-semibold truncate cursor-default">
                    {generatedName ?? message.path.join(" → ")}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" align="start">
                  <span className="text-xs font-mono">{message.path.join(" → ")}</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {isModified && (
          <Button className="text-secondary-foreground hover:text-foreground" variant="ghost" onClick={handleReset}>
            <RotateCcw size={12} className="mr-1" />
            Reset
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between p-2">
        <span className="text-xs text-muted-foreground">Override System Prompt</span>
        <Switch checked={isEnabled} onCheckedChange={handleToggle} />
      </div>
      {isEnabled && (
        <Textarea
          value={localContent}
          onChange={(e) => setLocalContent(e.target.value)}
          onBlur={handleBlur}
          className={cn(
            "min-h-32 max-h-120 text-sm font-mono resize-y border-0 bg-transparent focus-visible:ring-0 shadow-none"
          )}
          placeholder="Enter system message..."
        />
      )}
    </div>
  );
}
