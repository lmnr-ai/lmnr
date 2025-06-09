import { Handle, Position } from "@xyflow/react";
import { Circle, Play, Square } from "lucide-react";
import { memo } from "react";

import { NODE_DIMENSIONS } from "@/lib/lang-graph/types";
import { cn } from "@/lib/utils";

interface SchemaNodeProps {
  data: {
    label: string;
    isStart?: boolean;
    isEnd?: boolean;
  };
  selected?: boolean;
}

const SchemaNode = memo(({ data, selected }: SchemaNodeProps) => {
  const { label, isStart, isEnd } = data;

  return (
    <div
      className={cn(
        "shadow-md rounded-lg bg-white border-2 border-gray-200 flex items-center justify-center p-3 overflow-hidden",
        {
          "border-blue-500": selected,
          "border-green-500 bg-green-50": isStart,
          "border-red-500 bg-red-50": isEnd,
        }
      )}
      style={{
        width: NODE_DIMENSIONS.width,
        minHeight: NODE_DIMENSIONS.minHeight,
        maxHeight: NODE_DIMENSIONS.maxHeight,
      }}
    >
      <div className="flex items-center space-x-2 w-full">
        {isStart && <Play className="w-4 h-4 text-green-600 flex-shrink-0" />}
        {isEnd && <Square className="w-4 h-4 text-red-600 flex-shrink-0" />}
        {!isStart && !isEnd && <Circle className="w-4 h-4 text-gray-600 flex-shrink-0" />}
        <div title={label} className="text-sm font-medium text-gray-900 truncate">
          {label}
        </div>
      </div>

      {!isStart && <Handle type="target" position={Position.Top} className="w-3 h-3 border-2 border-gray-400" />}
      {!isEnd && <Handle type="source" position={Position.Bottom} className="w-3 h-3 border-2 border-gray-400" />}
    </div>
  );
});

SchemaNode.displayName = "SchemaNode";

export default memo(SchemaNode);
