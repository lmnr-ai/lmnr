import { ExtractorNode } from '@/lib/flow/types'
import useStore from '@/lib/flow/store';
import { Label } from '@/components/ui/label';
import { memo } from 'react';
import Ide from '@/components/ui/ide';

const ExtractorNodeComponent = ({ data }: { data: ExtractorNode }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);

  return (
    <div className='flex flex-col space-y-2 p-4'>
      <Label className='mt-2'>RegEx</Label>
      <Ide
        className='rounded'
        value={data.format}
        placeholder='Regular expression'
        onChange={(val) => {
          // setFormat(e.currentTarget.value);
          updateNodeData(data.id, {
            format: val
          } as ExtractorNode);
        }}
        maxLines={Infinity}
        minLines={3}
        mode="javascript"
      />
    </div>
  )
}

export default memo(ExtractorNodeComponent)
