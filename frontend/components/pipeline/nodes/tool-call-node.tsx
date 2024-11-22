import { Label } from '@/components/ui/label';
import { ToolCallNode } from '@/lib/flow/types';

const ToolCallNodeComponent = ({ data }: { data: ToolCallNode }) => (
  <div className="flex flex-col space-y-2 p-4">
    <Label className="mt-2">
      Tool (function) name must match the node name
    </Label>
  </div>
);

export default ToolCallNodeComponent;
