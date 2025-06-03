import { Activity, ArrowRight, Bolt, Braces, CircleAlert, Gauge, MessageCircleMore } from "lucide-react";

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

    switch (spanType) {
      case SpanType.DEFAULT:
        return <Braces className={iconClassName} size={size} />;
      case SpanType.LLM:
        return <MessageCircleMore className={iconClassName} size={size} />;
      case SpanType.EXECUTOR:
        return <Activity className={iconClassName} size={size} />;
      case SpanType.EVALUATOR:
        return <ArrowRight className={iconClassName} size={size} />;
      case SpanType.EVALUATION:
        return <Gauge className={iconClassName} size={size} />;
      case SpanType.TOOL:
        return <Bolt className={iconClassName} size={size} />;
      default:
        return <Braces className={iconClassName} size={size} />;
    }
  };

  return (
    <div
      className={cn("flex items-center justify-center z-10 rounded", className)}
      style={{
        backgroundColor: status === "error" ? "rgba(204, 51, 51, 1)" : SPAN_TYPE_TO_COLOR[spanType], // Red background for errors
        width: containerWidth,
        height: containerHeight,
      }}
    >
      {renderIcon()}
    </div>
  );
}
