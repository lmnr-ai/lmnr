"use client";

import { AlertTriangle, Loader2, Play, RotateCcw, Save, Square } from "lucide-react";
import React, { Fragment, useMemo } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useRolloutSessionStoreContext } from "./rollout-session-store";
import { SystemMessage } from "./system-messages-utils";

interface SystemMessageEditorProps {
  message: SystemMessage;
  isEnabled: boolean;
  overrideContent: string | undefined;
  onToggle: () => void;
  onEdit: (content: string) => void;
  onReset: () => void;
}

const SystemMessageEditor = ({
  message,
  isEnabled,
  overrideContent,
  onToggle,
  onEdit,
  onReset,
}: SystemMessageEditorProps) => {
  const currentContent = overrideContent || message.content;
  const isModified = isEnabled && overrideContent !== undefined && overrideContent !== message.content;

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-card transition-all overflow-hidden divide-y",
        isEnabled && "border-primary/50 ring-1 ring-primary/20"
      )}
    >
      <div className="flex items-center justify-between px-2 bg-muted/30">
        <div className="flex items-center gap-2 truncate overflow-x-auto no-scrollbar py-2">
          <span className="text-sm font-medium font-mono" title={message.path}>
            {message.path}
          </span>
        </div>
        {isModified && (
          <Button className="text-secondary-foreground hover:text-foreground" variant="ghost" onClick={onReset}>
            <RotateCcw size={12} className="mr-1" />
            Reset
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2 p-2">
        <Switch checked={isEnabled} onCheckedChange={onToggle} />
        <span className="text-xs text-muted-foreground">Override System Prompt</span>
      </div>
      {isEnabled && (
        <Textarea
          value={currentContent}
          onChange={(e) => onEdit(e.target.value)}
          className={cn(
            "min-h-32 max-h-64 text-sm font-mono resize-y border-0 bg-transparent focus-visible:ring-0 shadow-none"
          )}
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
    overrides,
    toggleOverride,
    updateOverride,
    isOverrideEnabled,
    resetOverride,
    rolloutError,
    params,
    paramValues,
    setParamValue,
    sessionStatus,
  } = useRolloutSessionStoreContext((state) => ({
    systemMessagesMap: state.systemMessagesMap,
    isSystemMessagesLoading: state.isSystemMessagesLoading,
    overrides: state.overrides,
    toggleOverride: state.toggleOverride,
    updateOverride: state.updateOverride,
    isOverrideEnabled: state.isOverrideEnabled,
    resetOverride: state.resetOverride,
    rolloutError: state.rolloutError,
    params: state.params,
    paramValues: state.paramValues,
    setParamValue: state.setParamValue,
    sessionStatus: state.sessionStatus,
  }));

  const messages = useMemo(() => Array.from(systemMessagesMap.values()), [systemMessagesMap]);

  const isRunning = sessionStatus === "RUNNING";
  const canRun = sessionStatus === "PENDING" || sessionStatus === "FINISHED" || sessionStatus === "STOPPED";

  return (
    <div className="flex flex-col flex-1 gap-4 divide-y [&>div]:px-4 pt-4 [&>div]:pb-4 overflow-y-auto styled-scrollbar">
      <div className="flex flex-col gap-2">
        {isRunning ? (
          <Button className="w-fit" variant="destructive" onClick={onCancel} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 size={14} className="mr-2 animate-spin" />
                Cancelling...
              </>
            ) : (
              <>
                <Square size={14} className="mr-2" />
                Cancel
              </>
            )}
          </Button>
        ) : (
          <Button className="w-fit" onClick={onRollout} disabled={isLoading || !canRun}>
            {isLoading ? (
              <>
                <Loader2 size={14} className="mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play size={14} className="mr-2" />
                Run Rollout
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

      {params && params.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">Parameters</h4>
          <div className="flex flex-col gap-2">
            {params.map((param, index) => (
              <Fragment key={param.name}>
                <label className="text-xs font-medium text-muted-foreground">{param.name}</label>
                <Textarea
                  className="text-sm min-h-20 resize-y"
                  placeholder={`Enter ${param.name}...`}
                  value={paramValues[param.name] || ""}
                  onChange={(e) => setParamValue(param.name, e.target.value)}
                />
              </Fragment>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">System Prompts</h4>
        {isSystemMessagesLoading ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Loader2 size={24} className="text-muted-foreground animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Loading system prompts...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <Save size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No system prompts found</p>
            <p className="text-xs text-muted-foreground/70 mt-1">System prompts will appear here once detected</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((message) => (
              <SystemMessageEditor
                key={message.id}
                message={message}
                isEnabled={isOverrideEnabled(message.id)}
                overrideContent={overrides[message.path]?.system}
                onToggle={() => toggleOverride(message.id)}
                onEdit={(content) => updateOverride(message.path, content)}
                onReset={() => resetOverride(message.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
