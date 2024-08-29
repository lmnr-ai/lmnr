import { NodeHandleType, CodeSandboxNode } from '@/lib/flow/types'
import useStore from '@/lib/flow/store';
import { Label } from '@/components/ui/label';
import { v4 } from 'uuid';
import { Switch } from '@/components/ui/switch';

export default function CodeSandboxNodeComponent({ data }: { data: CodeSandboxNode }) {
  const { updateNodeData, dropEdgeForHandle } = useStore((state) => state);

  return (
    <div className='p-4 flex flex-col space-y-2'>
      <div className='flex flex-row space-between'>
        <Label className='flex-grow'>Output error</Label>
        <Switch
          checked={data.enableErrorPassing}
          onCheckedChange={(checked) => {
            if (checked) {
              updateNodeData(data.id, {
                enableErrorPassing: true,
                outputs: [
                  ...data.outputs,
                  {
                    id: v4(),
                    name: 'error',
                    type: NodeHandleType.STRING
                  }
                ],
              } as CodeSandboxNode)
            } else {
              dropEdgeForHandle(data.outputs[data.outputs.length - 1].id)
              updateNodeData(data.id, {
                enableErrorPassing: false,
                outputs: data.outputs.slice(0, data.outputs.length - 1)
              } as CodeSandboxNode)
            }
          }}
        />
      </div>
      <Label className='text-secondary-foreground text-sm'>
        If an error occurs during code execution, pass it as an output
      </Label>
    </div>
  )
}
