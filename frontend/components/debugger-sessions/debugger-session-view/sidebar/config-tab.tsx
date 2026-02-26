"use client";

import { json } from "@codemirror/lang-json";
import CodeMirror from "@uiw/react-codemirror";
import { CirclePlay, Loader, Loader2, MessageSquare, Square } from "lucide-react";
import React, { useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { Button } from "@/components/ui/button";
import { baseExtensions, theme } from "@/components/ui/content-renderer/utils.ts";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

import { useDebuggerSessionStore } from "../store";
import SystemMessageEditor from "./system-message-editor";

interface ConfigTabProps {
  onRun: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  isActive?: boolean;
}

export default function ConfigTab({ onRun, onCancel, isLoading, isActive }: ConfigTabProps) {
  const { systemMessagesMap, isSystemMessagesLoading, params, paramValues, setParamValue, error, sessionStatus } =
    useDebuggerSessionStore((state) => ({
      systemMessagesMap: state.systemMessagesMap,
      isSystemMessagesLoading: state.isSystemMessagesLoading,
      params: state.params,
      paramValues: state.paramValues,
      setParamValue: state.setParamValue,
      error: state.error,
      sessionStatus: state.sessionStatus,
    }));

  const isRunning = sessionStatus === "RUNNING";

  useHotkeys(
    "meta+enter,ctrl+enter",
    () => {
      if (!isRunning && !isLoading && isActive) {
        onRun();
      }
    },
    {
      enabled: !isRunning && !isLoading && isActive,
    },
    [isRunning, isLoading, isActive, onRun]
  );

  const messages = useMemo(() => Array.from(systemMessagesMap.values()), [systemMessagesMap]);

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 px-4 py-2">
          {params && params.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">Input Arguments</h4>
              <div className="flex flex-col gap-2">
                <div className="text-xs text-muted-foreground px-2 py-1 bg-muted/30 rounded-md">
                  <span className="font-medium">Arguments order: </span>
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
                    placeholder='Enter arguments as array [value1, value2] or object {"key1": value1, "key2": value2}'
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
      </ScrollArea>

      <div className="flex items-center gap-2 border-t px-4 pt-4 pb-4">
        {error && <span className="text-sm font-semibold text-destructive">{error}</span>}
        <div className="flex ml-auto">
          {isRunning ? (
            <Button variant="destructive" onClick={onCancel} disabled={isLoading}>
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
            <Button onClick={onRun} disabled={isLoading || isRunning}>
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
                    ⌘ ⏎
                  </kbd>
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
