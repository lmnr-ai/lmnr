"use client";

import { AlertTriangle, Loader2, Play, RotateCcw, Save, Square } from "lucide-react";
import React, { Fragment, useMemo } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useRolloutSessionStoreContext } from "./rollout-session-store";
import { SystemMessage } from "./system-messages-utils";

interface SystemMessageEditorProps {
  message: SystemMessage;
  editedContent: string | undefined;
  onEdit: (content: string) => void;
  onReset: () => void;
}

const SystemMessageEditor = ({ message, editedContent, onEdit, onReset }: SystemMessageEditorProps) => {
  const isEdited = editedContent !== undefined;
  const currentContent = editedContent ?? message.content;

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-card transition-all overflow-hidden",
        isEdited && "border-primary/50 ring-1 ring-primary/20"
      )}
    >
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 truncate overflow-x-auto no-scrollbar">
          <span className="text-sm font-medium font-mono" title={message.path}>
            {message.path}
          </span>
          {isEdited && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
              Modified
            </span>
          )}
        </div>
        {isEdited && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onReset}
          >
            <RotateCcw size={12} className="mr-1" />
            Reset
          </Button>
        )}
      </div>
      <Textarea
        value={currentContent}
        onChange={(e) => onEdit(e.target.value)}
        className={cn(
          "min-h-32 max-h-64 text-sm font-mono resize-y border-0 bg-transparent focus-visible:ring-0 shadow-none"
        )}
        placeholder="Enter system message..."
      />
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
    editedMessages,
    setEditedMessage,
    resetEditedMessage,
    rolloutError,
    params,
    paramValues,
    setParamValue,
    sessionStatus,
  } = useRolloutSessionStoreContext((state) => ({
    systemMessagesMap: state.systemMessagesMap,
    isSystemMessagesLoading: state.isSystemMessagesLoading,
    editedMessages: state.editedMessages,
    setEditedMessage: state.setEditedMessage,
    resetEditedMessage: state.resetEditedMessage,
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
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-2 p-2">
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

      <div className="flex-1 overflow-y-auto styled-scrollbar">
        <div className="flex flex-col gap-4 p-4">
          {params && params.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold text-muted-foreground">Parameters</h4>
              <div className="flex flex-col gap-2">
                {params.map((param, index) => (
                  <Fragment key={param.name}>
                    <label className="text-xs font-medium text-foreground">{param.name}</label>
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
            <h4 className="text-xs font-semibold text-muted-foreground">System Prompts</h4>
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
                    editedContent={editedMessages.get(message.id)}
                    onEdit={(content) => setEditedMessage(message.id, content)}
                    onReset={() => resetEditedMessage(message.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
