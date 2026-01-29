"use client";

import { motion } from "framer-motion";
import { Bolt, Braces, ChevronDown, ChevronRight, MessageCircle } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { BranchConnector } from "./branch-connector";

export type SpanType = "DEFAULT" | "LLM" | "TOOL";

export interface MockSpan {
  id: string;
  name: string;
  type: SpanType;
  depth: number;
  branchMask: boolean[];
  content?: string;
  hasChildren?: boolean;
  isSelected?: boolean;
}

interface SpanRowProps {
  span: MockSpan;
  mode: "tree" | "reader";
}

const ROW_HEIGHT = 28;
const SQUARE_SIZE = 18;
const ICON_SIZE = 12;

// Icon backgrounds matching the landing design
const TYPE_BACKGROUNDS: Record<SpanType, string> = {
  DEFAULT: "bg-blue-500/30",
  LLM: "bg-[rgba(116,63,227,0.3)]",
  TOOL: "bg-landing-primary-400/30",
};

function getSpanIcon(type: SpanType): ReactNode {
  const iconProps = { size: ICON_SIZE, className: "text-landing-text-300" };

  switch (type) {
    case "DEFAULT":
      return <Braces {...iconProps} />;
    case "LLM":
      return <MessageCircle {...iconProps} />;
    case "TOOL":
      return <Bolt {...iconProps} />;
  }
}

const spanVariants = {
  tree: (isDefault: boolean) => ({
    height: "auto",
    opacity: 1,
    backgroundColor: "transparent",
    transition: { duration: 1.2, ease: "easeInOut" },
  }),
  reader: (isDefault: boolean) => ({
    height: isDefault ? 0 : "auto",
    opacity: isDefault ? 0 : 1,
    backgroundColor: isDefault ? "var(--color-landing-surface-500)" : "transparent",
    transition: { duration: 1.2, ease: "easeInOut" },
  }),
};

export function SpanRow({ span, mode }: SpanRowProps) {
  const isDefault = span.type === "DEFAULT";
  const isExpanded = span.hasChildren || span.type !== "DEFAULT";
  const hasContent = span.content && (span.type === "LLM" || span.type === "TOOL");
  const isSelected = span.isSelected;

  return (
    <motion.div
      className="w-full overflow-hidden"
      variants={spanVariants}
      animate={mode}
      custom={isDefault}
      initial={false}
    >
      {/* Inner wrapper for selected styling */}
      <div
        className={cn(
          "flex flex-row w-full",
          isSelected && "bg-landing-primary-400/10 border-l border-l-landing-primary-400"
        )}
      >
        {/* Tree gutter - branch connectors */}
        <BranchConnector depth={span.depth} branchMask={span.branchMask} mode={mode} />

        {/* Reader mode padding */}
        <motion.div
          className="shrink-0"
          animate={{ width: mode === "reader" ? 12 : 0 }}
          initial={false}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        />

        {/* Icon column */}
        <div className="flex flex-col items-center shrink-0 pt-1 self-stretch">
          <div
            className={cn("flex items-center justify-center rounded", TYPE_BACKGROUNDS[span.type])}
            style={{
              minWidth: SQUARE_SIZE,
              minHeight: SQUARE_SIZE,
              width: SQUARE_SIZE,
              height: SQUARE_SIZE,
            }}
          >
            {getSpanIcon(span.type)}
          </div>
          {/* Tiny connector if there are children */}
          {span.hasChildren && <div className="h-full flex-1 border-l-2 border-landing-surface-400" />}
        </div>

        {/* Content column */}
        <div className="flex flex-col flex-1 min-w-0 ml-2">
          {/* Header row */}
          <div className={cn("flex items-center md:gap-2 gap-1.5 pr-1")} style={{ height: ROW_HEIGHT }}>
            <p
              className={cn(
                "font-sans truncate md:text-xs text-[10px]",
                isSelected ? "text-landing-primary-400" : "text-landing-text-300"
              )}
            >
              {span.name}
            </p>
            {isExpanded ? (
              <ChevronDown size={10} className="shrink-0 text-landing-text-500" />
            ) : (
              <ChevronRight size={10} className="shrink-0 text-landing-text-500" />
            )}
          </div>

          {/* Expandable content for LLM/TOOL spans */}
          {hasContent && (
            <div className={cn("md:pr-2 md:pb-2", "pr-1.5 pb-1.5")}>
              <p
                className={cn(
                  "font-sans leading-normal md:text-xs text-[10px]",
                  isSelected ? "text-landing-primary-400" : "text-landing-text-500"
                )}
              >
                {span.content}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
