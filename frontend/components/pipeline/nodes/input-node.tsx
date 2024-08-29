
import GenericNodeComponent from './generic-node'
import { NodeHandleType, type InputNode } from '@/lib/flow/types'
import useStore from '@/lib/flow/store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { memo } from 'react';

const InputNodeComponent = ({ id, data }: { id: string, data: InputNode }) => {
  const { updateNodeData, dropEdgeForHandle } = useStore((state) => state);

  return (
    <GenericNodeComponent id={id} data={data} className='flex flex-col space-y-2'>
      <Label>Input Type</Label>
      <Select
        value={data.outputs[0].type}
        onValueChange={(value: NodeHandleType) => {
          dropEdgeForHandle(data.outputs[0].id);
          const newOutputs = [{
            ...data.outputs[0],
            type: value
          }]
          updateNodeData(id, {

            outputs: newOutputs,
            inputType: value
          } as InputNode);
        }}
      >
        <SelectTrigger className="mb-4 h-8 w-full font-medium">
          <SelectValue placeholder="Input Type" />
        </SelectTrigger>
        <SelectContent>
          {
            Object.values(NodeHandleType).filter(t => [NodeHandleType.STRING, NodeHandleType.STRING_LIST, NodeHandleType.CHAT_MESSAGE_LIST].includes(t)).map((nodeType, i) => (
              <SelectItem key={i} value={nodeType}>
                {nodeType}
              </SelectItem>
            ))
          }
        </SelectContent>
      </Select>
    </GenericNodeComponent>
  )
}

export default memo(InputNodeComponent)
