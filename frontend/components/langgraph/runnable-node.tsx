import { Handle, Position } from "@xyflow/react";
import { Cog, Wrench } from "lucide-react";
import { memo } from "react";

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

  // Extract class name for styling
  const className = originalData?.id?.[originalData.id.length - 1] || "";
  const isAgent = className.includes("Agent") || label.toLowerCase().includes("agent");
  const isTool = className.includes("Tool") || label.toLowerCase().includes("tool");

  return (
    <div
      className={cn(
        "px-4 py-3 shadow-md rounded-lg bg-white border-2 min-w-[140px]",
        selected && "border-blue-500",
        isAgent && "border-purple-500 bg-purple-50",
        isTool && "border-orange-500 bg-orange-50",
        !isAgent && !isTool && "border-gray-300 bg-gray-50"
      )}
    >
      <div className="flex items-center space-x-2">
        {isAgent && <Cog className="w-4 h-4 text-purple-600" />}
        {isTool && <Wrench className="w-4 h-4 text-orange-600" />}
        {!isAgent && !isTool && <Cog className="w-4 h-4 text-gray-600" />}
        <div className="text-sm font-medium text-gray-900">{label}</div>
      </div>

      {originalData?.id && <div className="text-xs text-gray-500 mt-1 truncate">{originalData.id.join(".")}</div>}

      <Handle type="target" position={Position.Top} className="w-3 h-3 border-2 border-gray-400" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 border-2 border-gray-400" />
    </div>
  );
});

RunnableNode.displayName = "RunnableNode";

export default RunnableNode;
