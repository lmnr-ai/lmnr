import { ToolCallNode } from "@/lib/flow/types";
import { Label } from '@/components/ui/label';

const ToolCallNodeComponent = ({ data }: { data: ToolCallNode }) => {
  return (
    <div className='flex flex-col space-y-2 p-4'>
      <Label className='mt-2'>Tool (function) name must match the node name</Label>
    </div>
  )
}

export default ToolCallNodeComponent;
