"use client";

import { ChevronDown, ChevronRight, Copy, Edit2, Play, Trash2 } from "lucide-react";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { SystemMessage } from "./system-messages-utils";

interface SystemMessagesSidebarProps {
  systemMessages: Map<string, SystemMessage>;
  onCreateVariant: (originalId: string, content: string) => void;
  onUpdateVariant: (variantId: string, content: string) => void;
  onDeleteVariant: (variantId: string) => void;
  onRollout: () => void;
  pathToCount: Record<string, number>;
}

const SystemMessageCard = ({
  message,
  onCreateVariant,
  onUpdateVariant,
  onDeleteVariant,
}: {
  message: SystemMessage;
  onCreateVariant?: (content: string) => void;
  onUpdateVariant?: (content: string) => void;
  onDeleteVariant?: () => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);

  const handleSave = () => {
    if (!message.isOriginal && editedContent !== message.content) {
      onUpdateVariant?.(editedContent);
    }
  };

  const handleCollapse = () => {
    handleSave();
    setIsExpanded(false);
  };

  const preview = message.content.length > 60 ? `${message.content.slice(0, 60)}...` : message.content;

  return (
    <div className={cn("border rounded-md", !message.isOriginal && "border-primary")}>
      <div
        className="flex items-start gap-2 p-1 cursor-pointer hover:bg-muted/50 rounded-md"
        onClick={() => isExpanded ? handleCollapse() : setIsExpanded(true)}
      >
        <Button variant="ghost" onClick={(e) => { e.stopPropagation(); isExpanded ? handleCollapse() : setIsExpanded(true); }}>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </Button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium flex items-center h-7 gap-2">
            <span className={cn(message.isOriginal ? "text-foreground" : "text-primary")}>
              {message.name}
            </span>
          </div>
          {!isExpanded && <div className="text-xs text-muted-foreground truncate">{preview}</div>}
          {message.isOriginal && !isExpanded && (
            <div className="text-xs text-muted-foreground">
              {message.spanIds.length} span{message.spanIds.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
        {!message.isOriginal && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDeleteVariant?.(); }}
            >
              <Trash2 size={14} />
            </Button>
        )}
      </div>

      {isExpanded && (
        <div className="px-2.5 pb-2.5 pt-0 mt-2">
          {!message.isOriginal ? (
            // Variants are always editable, saves on blur or collapse
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              onBlur={handleSave}
              className="min-h-32 max-h-64 text-sm font-mono"
            />
          ) : (
            // Original messages are read-only
            <>
              <div className="text-sm whitespace-pre-wrap bg-muted/30 p-2 rounded border max-h-48 overflow-y-auto styled-scrollbar">
                {message.content}
              </div>
              <Button
                variant="outline"
                onClick={(e) => { e.stopPropagation(); onCreateVariant?.(message.content); }}
                className="mt-2 self-end"
              >
                <Copy size={14} className="mr-2" />
                Create Variant
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default function SystemMessagesSidebar({
  systemMessages,
  onCreateVariant,
  onUpdateVariant,
  onDeleteVariant,
  onRollout,
  pathToCount,
}: SystemMessagesSidebarProps) {
  const messagesArray = Array.from(systemMessages.values());
  const originalMessages = messagesArray.filter((m) => m.isOriginal);
  const variantMessages = messagesArray.filter((m) => !m.isOriginal);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <Button onClick={onRollout}>
          <Play size={14} className="mr-2" />
          Run Rollout
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto styled-scrollbar p-3 space-y-4">
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Original Messages</h4>
          {originalMessages.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-4 text-center">
              No system messages found
            </div>
          ) : (
            <div className="space-y-2">
              {originalMessages.map((message) => (
                <SystemMessageCard 
                  key={message.id}
                  message={message} 
                  onCreateVariant={(content) => onCreateVariant(message.id, content)}
                />
              ))}
            </div>
          )}
        </div>

        {variantMessages.length > 0 && (
          <div className="pt-3 border-t">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Variants</h4>
            <div className="space-y-2">
              {variantMessages.map((message) => (
                <SystemMessageCard 
                  key={message.id}
                  message={message}
                  onUpdateVariant={(content) => onUpdateVariant(message.id, content)}
                  onDeleteVariant={() => onDeleteVariant(message.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

