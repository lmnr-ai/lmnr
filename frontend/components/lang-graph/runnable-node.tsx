import { Handle, Position } from "@xyflow/react";
import { Cog, Wrench } from "lucide-react";
import { memo } from "react";

import { NODE_DIMENSIONS } from "@/lib/lang-graph/types";
import { cn } from "@/lib/utils";

interface RunnableNodeProps {
  data: {
    label: string;
    originalData: any;
  };
  selected?: boolean;
}

const RunnableNode = memo(({ data, selected }: RunnableNodeProps) => {
  const { label, originalData } = data;

  const className = originalData?.id?.[originalData.id.length - 1] || "";
  const isAgent = className.includes("Agent") || label.toLowerCase().includes("agent");
  const isTool = className.includes("Tool") || label.toLowerCase().includes("tool");

  return (
    <div
      className={cn("shadow-md rounded-lg bg-white border-2 flex flex-col justify-center p-3 overflow-hidden", {
        "border-blue-500": selected,
        "border-purple-500 bg-purple-50": isAgent,
        "border-orange-500 bg-orange-50": isTool,
        "border-gray-300 bg-gray-50": !isAgent && !isTool,
      })}
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
        {isAgent && <Cog className="w-4 h-4 text-purple-600 flex-shrink-0" />}
        {isTool && <Wrench className="w-4 h-4 text-orange-600 flex-shrink-0" />}
        {!isAgent && !isTool && <Cog className="w-4 h-4 text-gray-600 flex-shrink-0" />}
        <div className="text-sm font-medium text-gray-900 break-words leading-tight">{label}</div>
      </div>

      {originalData?.id && (
        <div title={originalData.id.join(".")} className="text-xs text-gray-500 truncate leading-tight">
          {originalData.id.join(".")}
        </div>
      )}
      <Handle type="target" position={Position.Top} className="w-3 h-3 border-2 border-gray-400" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 border-2 border-gray-400" />
    </div>
  );
});

RunnableNode.displayName = "RunnableNode";

export default memo(RunnableNode);
