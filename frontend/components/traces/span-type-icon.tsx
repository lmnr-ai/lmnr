import { TooltipPortal } from "@radix-ui/react-tooltip";
import {
  Activity,
  ArrowRight,
  Bolt,
  Braces,
  CircleAlert,
  DatabaseZap,
  FlagTriangleRight,
  Gauge,
  MessageCircle,
  PersonStanding,
} from "lucide-react";
import { type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SpanType } from "@/lib/traces/types";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

interface SpanTypeIconProps {
  spanType: SpanType;
  containerWidth?: number;
  containerHeight?: number;
  size?: number;
  className?: string;
  iconClassName?: string;
  status?: string;
}

const DEFAULT_CONTAINER_SIZE = 22;
const DEFAULT_ICON_SIZE = 16;

export const createSpanTypeIcon = (type: SpanType, iconClassName: string = "w-4 h-4", size: number = 16): ReactNode => {
  const iconProps = { className: iconClassName, size };

  switch (type) {
    case SpanType.DEFAULT:
      return <Braces {...iconProps} />;
    case SpanType.LLM:
      return <MessageCircle {...iconProps} />;
    case SpanType.CACHED:
      // Replayed-from-source-trace LLM call — same purple container, cache icon.
      return <DatabaseZap {...iconProps} />;
    case SpanType.EXECUTOR:
      return <Activity {...iconProps} />;
    case SpanType.EVALUATOR:
      return <ArrowRight {...iconProps} />;
    case SpanType.EVALUATION:
      return <Gauge {...iconProps} />;
    case SpanType.TOOL:
      return <Bolt {...iconProps} />;
    case SpanType.EVENT:
      return <FlagTriangleRight {...iconProps} />;
    case SpanType.HUMAN_EVALUATOR:
      return <PersonStanding {...iconProps} />;
    default:
      return <Braces {...iconProps} />;
  }
};
export default function SpanTypeIcon({
  spanType,
  containerWidth = DEFAULT_CONTAINER_SIZE,
  containerHeight = DEFAULT_CONTAINER_SIZE,
  size = DEFAULT_ICON_SIZE,
  className,
  iconClassName,
  status,
}: SpanTypeIconProps) {
  const renderIcon = () => {
    if (status === "error") {
      return <CircleAlert className={iconClassName} size={size} />;
    }

    return createSpanTypeIcon(spanType, iconClassName, size);
  };

  const icon = (
    <div
      className={cn("flex items-center justify-center z-10 rounded", className)}
      style={{
        backgroundColor:
          status === "error"
            ? "rgba(204, 51, 51, 1)" // Red background for errors
            : SPAN_TYPE_TO_COLOR?.[spanType] || SPAN_TYPE_TO_COLOR[SpanType.DEFAULT],
        minWidth: containerWidth,
        minHeight: containerHeight,
        width: containerWidth,
        height: containerHeight,
      }}
    >
      {renderIcon()}
    </div>
  );

  if (spanType !== SpanType.CACHED) return icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{icon}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="left" className="text-xs">
          Replayed from source trace
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
