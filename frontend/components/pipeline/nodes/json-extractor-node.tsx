import { JsonExtractorNode } from '@/lib/flow/types'
import useStore from '@/lib/flow/store';
import { Label } from '@/components/ui/label';
import { memo } from 'react';
import Ide from '@/components/ui/ide';
import Link from 'next/link';

const JsonExtractorNodeComponent = ({ data }: { data: JsonExtractorNode }) => {
  const updateNodeData = useStore((state) => state.updateNodeData);

  return (
    <div className='flex flex-col space-y-2 p-4'>
      <Label className='mt-2'>JSON template</Label>
      <Label className="text-gray-500">Read more about Handlebars syntax at&nbsp;
        <Link href="https://handlebarsjs.com/guide/" className="text-primary" target="blank">https://handlebarsjs.com/guide/</Link>
      </Label>
      <Ide
        className='rounded'
        value={data.template}
        placeholder='{{name}}'
        mode='handlebars'
        onChange={(val) => {
          // setFormat(e.currentTarget.value);
          updateNodeData(data.id, {
            template: val
          } as JsonExtractorNode);
        }}
        maxLines={Infinity}
        minLines={3}
      />
      <Label className="text-gray-500">
        {`Hint: to avoid nested objects displayed as [Object], prefix your key with the word json, such as {{ json user }}`}
      </Label>
    </div>
  )
}

export default memo(JsonExtractorNodeComponent)
