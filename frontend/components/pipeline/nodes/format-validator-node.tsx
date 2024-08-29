import { FormatValidatorNode } from '@/lib/flow/types'
import useStore from '@/lib/flow/store';
import { Label } from '@/components/ui/label';
import Ide from '@/components/ui/ide';

const FormatValidatorNodeComponent = ({ data }: { data: FormatValidatorNode }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);

  return (
    <div className='flex flex-col space-y-2 p-4'>
      <Label className='mt-2'>Format RegEx</Label>
      <Ide
        className='rounded'
        value={data.format}
        placeholder='Regular expression'
        onChange={(val) => {
          updateNodeData(data.id, {
            format: val
          } as FormatValidatorNode);
        }}
        maxLines={Infinity}
        minLines={3}
        mode="javascript"
      />
    </div>
  )
}

export default FormatValidatorNodeComponent
