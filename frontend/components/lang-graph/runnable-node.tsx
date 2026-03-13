import { Handle, Position } from "@xyflow/react";
import { Bolt, Braces } from "lucide-react";
import { memo } from "react";

import { NODE_DIMENSIONS } from "@/lib/lang-graph/types";
import { cn } from "@/lib/utils";

interface RunnableNodeProps {
  data: {
    label: string;
    originalData: any;
  };
}

const RunnableNode = memo(({ data }: RunnableNodeProps) => {
  const { label, originalData } = data;

  const className = originalData?.id?.[originalData.id.length - 1] || "";
  const isAgent = className.includes("Agent") || label.toLowerCase().includes("agent");
  const isTool = className.includes("Tool") || label.toLowerCase().includes("tool");

  return (
    <div
      className={cn(
        "shadow-md rounded-lg border-2 border-chart-1/50 bg-card flex flex-col justify-center p-3 overflow-hidden",
        {
          "border-chart-1/50 bg-card": isAgent,
          "border-tool": isTool,
        }
      )}
      style={{
        width: NODE_DIMENSIONS.width,
        minHeight: NODE_DIMENSIONS.minHeight,
        maxHeight: NODE_DIMENSIONS.maxHeight,
      }}
    >
      <div
        className={cn("flex items-center space-x-2 w-full", {
          "mb-1": originalData?.id,
        })}
      >
        {isAgent && (
          <div
            className={cn("flex items-center justify-center w-[22px] h-[22px] z-10 rounded bg-chart-1/40", className)}
          >
            <Braces className="w-4 h-4" />
          </div>
        )}
        {isTool && (
          <div className={cn("flex items-center justify-center w-[22px] h-[22px] z-10 rounded bg-tool", className)}>
            <Bolt className="w-4 h-4" />
          </div>
        )}
        {!isAgent && !isTool && (
          <div
            className={cn("flex items-center justify-center w-[22px] h-[22px] z-10 rounded bg-chart-1/40", className)}
          >
            <Braces className="w-4 h-4" />
          </div>
        )}
        <div className="text-sm font-medium text-foreground wrap-break-word leading-tight">{label}</div>
      </div>

      {originalData?.id && (
        <div title={originalData.id.join(".")} className="text-xs text-muted-foreground truncate leading-tight">
          {originalData.id.join(".")}
        </div>
      )}
      <Handle type="target" position={Position.Top} className="invisible w-3 h-3 border-2 border-gray-400" />
      <Handle type="source" position={Position.Bottom} className="invisible w-3 h-3 border-2 border-gray-400" />
    </div>
  );
});

RunnableNode.displayName = "RunnableNode";

export default memo(RunnableNode);
