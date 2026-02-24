"use client";

import { json } from "@codemirror/lang-json";
import CodeMirror from "@uiw/react-codemirror";
import { AlertTriangle, CirclePlay, Loader, Loader2, MessageSquare, RotateCcw, Square } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { baseExtensions, theme } from "@/components/ui/content-renderer/utils.ts";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import RolloutSessionHistory from "./rollout-session-history";
import { useRolloutSessionStoreContext } from "./rollout-session-store";
import { type SystemMessage } from "./system-messages-utils";

const SystemMessageEditor = ({ message }: { message: SystemMessage }) => {
  const { projectId, id: sessionId } = useParams<{ projectId: string; id: string }>();

  const { overrideContent, isEnabled, generatedName, toggleOverride, updateOverride, resetOverride, setGeneratedName } =
    useRolloutSessionStoreContext((state) => ({
      overrideContent: state.overrides[message.pathKey]?.system,
      isEnabled: state.isOverrideEnabled(message.id),
      generatedName: state.generatedNames[message.pathKey],
      toggleOverride: state.toggleOverride,
      updateOverride: state.updateOverride,
      resetOverride: state.resetOverride,
      setGeneratedName: state.setGeneratedName,
    }));

  const currentContent = overrideContent || message.content;
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
        const res = await fetch(`/api/projects/${projectId}/rollout-sessions/${sessionId}/generate-name`, {
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
          className={cn("min-h-32 text-sm font-mono resize-y border-0 bg-transparent focus-visible:ring-0 shadow-none")}
          placeholder="Enter system message..."
        />
      )}
    </div>
  );
};

interface RolloutSidebarProps {
  onRollout: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function RolloutSidebar({ onRollout, onCancel, isLoading }: RolloutSidebarProps) {
  const {
    systemMessagesMap,
    isSystemMessagesLoading,
    rolloutError,
    params,
    paramValues,
    setParamValue,
    sessionStatus,
  } = useRolloutSessionStoreContext((state) => ({
    systemMessagesMap: state.systemMessagesMap,
    isSystemMessagesLoading: state.isSystemMessagesLoading,
    rolloutError: state.rolloutError,
    params: state.params,
    paramValues: state.paramValues,
    setParamValue: state.setParamValue,
    sessionStatus: state.sessionStatus,
  }));

  const messages = useMemo(() => Array.from(systemMessagesMap.values()), [systemMessagesMap]);

  const isRunning = sessionStatus === "RUNNING";
  const canRun = sessionStatus === "PENDING" || sessionStatus === "FINISHED" || sessionStatus === "STOPPED";

  const handleParamsBlur = () => {
    if (paramValues && paramValues.trim() !== "") {
      try {
        const parsed = JSON.parse(paramValues);
        const prettified = JSON.stringify(parsed, null, 2);
        if (prettified !== paramValues) {
          setParamValue(prettified);
        }
      } catch {
        // Invalid JSON, ignore prettification
      }
    }
  };

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
    <div className="flex flex-col flex-1 gap-4 divide-y [&>div]:px-4 pt-4 [&>div]:pb-4 overflow-y-auto styled-scrollbar">
      <div className="flex flex-col gap-2">
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

      <RolloutSessionHistory />

      {params && params.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">Parameters</h4>
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground px-2 py-1 bg-muted/30 rounded-md">
              <span className="font-medium">Params order: </span>
              <span className="font-mono">{params.map((p) => p.name).join(", ")}</span>
            </div>
            <div className="flex border rounded-md bg-muted/50 overflow-hidden max-h-96">
              <CodeMirror
                className="w-full"
                value={paramValues}
                onBlur={handleParamsBlur}
                onChange={(value) => setParamValue(value)}
                extensions={[json(), ...baseExtensions]}
                theme={theme}
                placeholder='Enter params as array [value1, value2] or object {"key1": value1, "key2": value2}'
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">System Prompts</h4>
        {isSystemMessagesLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <MessageSquare size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No system prompts found</p>
            <p className="text-xs text-muted-foreground/70 mt-1">System prompts will appear here once detected</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((message) => (
              <SystemMessageEditor key={message.id} message={message} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
