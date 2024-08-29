import { memo } from 'react'
import GenericNodeComponent from './generic-node'
import { WebSearchNode } from '@/lib/flow/types'
import { Label } from '@/components/ui/label';
import DefaultTextarea from '@/components/ui/default-textarea';
import useStore from '@/lib/flow/store';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

const WebSearchNodeComponent = ({
  data,
}: {
  data: WebSearchNode;
}) => {

  const { updateNodeData } = useStore();

  return (
    <div className='p-4 flex flex-col space-y-2'>
      <Label>Scraped pages</Label>
      <Input
        id='limit'
        placeholder='top results to return'
        defaultValue={data.limit}
        onChange={(e) => {

          const l = Number.isNaN(Number(e.currentTarget.value)) ? 0 : Number(e.currentTarget.value)

          updateNodeData(data.id, {
            limit: l
          } as WebSearchNode);
        }}
      />
      <Label>Template</Label>
      <DefaultTextarea
        className='nodrag nowheel'
        defaultValue={data.template}
        onChange={(e) => {
          updateNodeData(data.id, {
            template: e.currentTarget.value
          } as WebSearchNode);
        }}
      />
      <div className='flex items-center w-full justify-between'>
        <Label className='mr-2'>Only semantically similar chunks</Label>
        <Switch
          checked={data.semanticTextSearchEnabled}
          onCheckedChange={(semanticTextSearchEnabled) => {
            updateNodeData(data.id, {
              semanticTextSearchEnabled,
            } as WebSearchNode)
          }}
        />
      </div>
      {data.semanticTextSearchEnabled && (
        <div>
          <Label>Limit</Label>
          <Input
            id='limit'
            defaultValue={data.semanticTextSearchLimit ?? 10}
            onChange={(e) => {
              updateNodeData(data.id, {
                semanticTextSearchLimit: Number.isNaN(Number(e.currentTarget.value)) ? 10 : Number(e.currentTarget.value)
              } as WebSearchNode);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default memo(WebSearchNodeComponent);
