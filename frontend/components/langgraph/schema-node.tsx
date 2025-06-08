import { Handle, Position } from "@xyflow/react";
import { Circle, Play, Square } from "lucide-react";
import { memo } from "react";

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
        "px-4 py-2 shadow-md rounded-lg bg-white border-2 border-gray-200 min-w-[120px]",
        selected && "border-blue-500",
        isStart && "border-green-500 bg-green-50",
        isEnd && "border-red-500 bg-red-50"
      )}
    >
      <div className="flex items-center space-x-2">
        {isStart && <Play className="w-4 h-4 text-green-600" />}
        {isEnd && <Square className="w-4 h-4 text-red-600" />}
        {!isStart && !isEnd && <Circle className="w-4 h-4 text-gray-600" />}
        <div className="text-sm font-medium text-gray-900">{label}</div>
      </div>

      {!isStart && <Handle type="target" position={Position.Top} className="w-3 h-3 border-2 border-gray-400" />}
      {!isEnd && <Handle type="source" position={Position.Bottom} className="w-3 h-3 border-2 border-gray-400" />}
    </div>
  );
});

SchemaNode.displayName = "SchemaNode";

export default SchemaNode;
