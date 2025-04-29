import { Activity, ArrowRight, Bolt, Braces, Gauge, MessageCircleMore } from "lucide-react";

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
}: SpanTypeIconProps) {
  return (
    <div
      className={cn("flex items-center justify-center z-10 rounded", className)}
      style={{
        backgroundColor: SPAN_TYPE_TO_COLOR[spanType],
        width: containerWidth,
        height: containerHeight,
      }}
    >
      {spanType === SpanType.DEFAULT && <Braces className={iconClassName} size={size} />}
      {spanType === SpanType.LLM && <MessageCircleMore className={iconClassName} size={size} />}
      {spanType === SpanType.EXECUTOR && <Activity className={iconClassName} size={size} />}
      {spanType === SpanType.EVALUATOR && <ArrowRight className={iconClassName} size={size} />}
      {spanType === SpanType.EVALUATION && <Gauge className={iconClassName} size={size} />}
      {spanType === SpanType.TOOL && <Bolt className={iconClassName} size={size} />}
    </div>
  );
}
