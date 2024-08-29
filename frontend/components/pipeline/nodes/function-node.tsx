import { FunctionNode, NodeHandleType } from '@/lib/flow/types'
import useStore from '@/lib/flow/store';
import { Label } from '@/components/ui/label';
import { memo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2Icon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const FunctionNodeComponent = ({ data }: { data: FunctionNode }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const dropEdgeForHandle = useStore((state) => state.dropEdgeForHandle);
  return (
    <div className='flex flex-col space-y-2 p-4'>
      <Label className='mb-4'>Node name must match the function name in your local code</Label>
      <Label>Parameter names</Label>
      {data.parameterNames.map((parameter, index) => (
        <div key={index} className='flex space-x-2 items-center'>
          <Input value={parameter}
            onChange={v => {
              let newParameters = [...data.parameterNames]
              let dynamicInputs = [...data.dynamicInputs!]
              newParameters[index] = v.target.value
              dynamicInputs[index].name = v.target.value
              updateNodeData(data.id, { parameterNames: newParameters, dynamicInputs } as FunctionNode)
            }}>
          </Input>
          <Button
            variant="ghost"
            onClick={() => {
              let newParameters = [...data.parameterNames]
              let newDynamicInputs = [...data.dynamicInputs!]
              dropEdgeForHandle(newDynamicInputs[index].id)
              newParameters.splice(index, 1)
              newDynamicInputs.splice(index, 1)
              updateNodeData(data.id, { parameterNames: newParameters, dynamicInputs: newDynamicInputs } as FunctionNode)
            }}>
            <Trash2Icon size={14} />
          </Button>
        </div>
      ))}
      <div>
        <Button
          variant="secondary"
          onClick={() => {
            let newParameters = [...data.parameterNames]
            let newDynamicInputs = [...data.dynamicInputs!]
            newParameters.push('')
            newDynamicInputs.push({ id: uuidv4(), name: '', type: NodeHandleType.ANY })
            updateNodeData(data.id, { parameterNames: newParameters, dynamicInputs: newDynamicInputs } as FunctionNode)
          }}>
          <Plus size={16} className='mr-1' /> Add parameter
        </Button>
      </div>
    </div>
  )
}

export default memo(FunctionNodeComponent)
