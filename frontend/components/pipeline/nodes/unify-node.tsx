import { memo, useEffect, useState } from 'react';
import GenericNodeComponent from './generic-node';
import {
  GenericNodeHandle,
  NodeHandleType,
  type UnifyNode,
} from '@/lib/flow/types';
import { Label } from '@/components/ui/label';
import UnifyModelSelect from './components/unify-model-select';
import useStore from '@/lib/flow/store';
import TemplatedTextArea from './components/templated-text-area';
import { Switch } from '@/components/ui/switch';
import IdeJson from '@/components/ui/ide-json';
import { v4 } from 'uuid';

const UnifyNodeComponent = ({
  data
}: {
  data: UnifyNode;
}) => {
  const [prompt, setSystemInstruction] = useState(data.prompt);
  const { updateNodeData, dropEdgeForHandle } = useStore();

  const defaultInputs = new Map<string, GenericNodeHandle>(data.dynamicInputs?.map((input) => [input.name!, input]) ?? []);

  // hack needed to update prompt from copilot message changes
  useEffect(() => {
    setSystemInstruction(data.prompt);
  }, [data.prompt]);

  const id = data.id;

  return (
    <div className='flex flex-col p-4 space-y-2'>
      <Label>Prompt</Label>
      <TemplatedTextArea
        className='w-full nowheel nodrag'
        value={prompt}
        defaultInputs={defaultInputs}
        onUpdate={(value, inputs, edgeIdsToRemove) => {
          setSystemInstruction(value);
          updateNodeData(id, {
            dynamicInputs: inputs,
            prompt: value
          } as UnifyNode)

          edgeIdsToRemove.forEach((id) => {
            dropEdgeForHandle(id);
          });

          ;
        }}
        placeholder='prompt'
      />
      <UnifyModelSelect savedUploadedBy={data.uploadedBy} savedModelName={data.modelName} savedProviderName={data.providerName} savedMetrics={data.metrics} onModelChange={updates => {
        updateNodeData(id, updates)
      }} />
      <div className='flex items-center w-full justify-between'>
        <Label className='mr-2'>Model params</Label>
        <Switch
          checked={data.modelParams !== null}
          onCheckedChange={(checked) => {
            updateNodeData(id, {
              modelParams: checked ? { 'temperature': 0 } : null
            } as UnifyNode)
          }}
        />
      </div>
      {data.modelParams !== null &&
        <IdeJson
          value={JSON.stringify(data.modelParams, null, 4) ?? ''}
          onChange={(value) => {
            try {
              const parsed = JSON.parse(value)
              updateNodeData(id, {
                modelParams: parsed
              } as UnifyNode)
            } catch (e) {

            }
          }}
        />
      }
      <div className='flex items-center w-full justify-between'>
        <Label className='mr-2'>Chat messages</Label>
        <Switch
          checked={data.inputs.length > 0}
          onCheckedChange={(checked) => {

            if (checked) {

              updateNodeData(id, {
                inputs: [{
                  id: v4(),
                  name: 'chat_messages',
                  type: NodeHandleType.CHAT_MESSAGE_LIST
                }]
              } as UnifyNode)
            } else {
              dropEdgeForHandle(data.inputs[0].id);
              updateNodeData(id, {
                inputs: []
              } as unknown as UnifyNode)

                ;
            }
          }}
        />
      </div>
    </div>
  )
};

export default memo(UnifyNodeComponent);
