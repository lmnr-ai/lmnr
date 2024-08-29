import { useEffect, useState } from 'react';
import {
  GenericNodeHandle,
  LLMNode,
  NodeHandleType,
} from '@/lib/flow/types';
import { Label } from '@/components/ui/label';
import LanguageModelSelect from './components/model-select';
import useStore from '@/lib/flow/store';
import TemplatedTextArea from './components/templated-text-area';
import { Switch } from '@/components/ui/switch';
import { v4 } from 'uuid';
import Ide from '@/components/ui/ide';
import StructuredOutputFields from './components/structured-output-fields';
import { PROVIDERS } from '@/lib/pipeline/types';

export default function LLM({
  data,
  editable = true
}: {
  data: LLMNode;
  editable?: boolean;
}) {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const dropEdgeForHandle = useStore((state) => state.dropEdgeForHandle);

  const defaultInputs = new Map<string, GenericNodeHandle>(data.dynamicInputs?.map((input) => [input.name!, input]) ?? []);

  // stores what was last selected in the model select, so we can restore it after re-disabling the model input
  const [selectedModelId, setSelectedModelId] = useState<string>(data.model ?? 'openai:gpt-3.5-turbo');

  return (
    <div className='p-4 flex flex-col space-y-2'>
      <div className='flex items-center'>
        <Label>Prompt</Label>
      </div>
      <TemplatedTextArea
        className='w-full nowheel nodrag'
        value={data.prompt}
        defaultInputs={defaultInputs}
        onUpdate={(value, inputs, edgeIdsToRemove) => {

          updateNodeData(data.id, {
            dynamicInputs: inputs,
            prompt: value
          } as LLMNode)

          edgeIdsToRemove.forEach((id) => {
            dropEdgeForHandle(id);
          });
        }}
        readOnly={!editable}
        placeholder='prompt'
      />
      <Label className='pt-2 '>Model</Label>
      <div className='flex items-center w-full justify-between'>
        <Label className='mr-2 text-secondary-foreground'>Supply model name as an input</Label>
        <Switch
          checked={data.model === undefined}
          onCheckedChange={(checked) => {
            if (checked) {
              updateNodeData(data.id, {
                inputs: [
                  {
                    id: v4(),
                    name: 'model',
                    type: NodeHandleType.STRING
                  },
                  ...data.inputs
                ],
                model: undefined
              } as LLMNode)
            } else {
              dropEdgeForHandle(
                data
                  .inputs
                  .find(input => input.name === 'model' && input.type === NodeHandleType.STRING)
                  ?.id!
              );
              updateNodeData(data.id, {
                model: selectedModelId,
                inputs: data.inputs.filter(input => !(input.name === 'model' && input.type === NodeHandleType.STRING))
              } as LLMNode)
            }
          }}
        />
      </div>
      {data.model !== undefined && (
        <>
          <LanguageModelSelect
            disabled={!editable}
            modelId={data.model}
            onModelChange={model => {
              updateNodeData(data.id, {
                model: model.id
              } as LLMNode)
              setSelectedModelId(model.id);
            }} />

        </>
      )}

      {data.model == undefined && (
        <div className='space-y-2 py-2 flex flex-col'>
          <Label className='text-secondary-foreground'>
            Supply the model as an input to this node in the <code>provider:model-id</code> format.
          </Label>
          <Label className='text-secondary-foreground'>{
            `Supported providers: ${PROVIDERS.join(', ')}.`}
          </Label>
        </div>
      )
      }
      <div className='flex items-center w-full justify-between border-t pt-2'>
        <Label className='mr-2'>Model params</Label>
        <Switch
          disabled={!editable}
          checked={data.modelParams !== null}
          onCheckedChange={(checked) => {
            updateNodeData(data.id, {
              modelParams: checked ? "{\n  \"temperature\": 0\n}" : null
            } as LLMNode)
          }}
        />
      </div>
      {data.modelParams !== null &&
        <Ide
          maxLines={Infinity}
          mode={'json'}
          value={typeof data.modelParams === 'string' ? data.modelParams : JSON.stringify(data.modelParams, null, 2)}
          onChange={(value) => {
            try {
              updateNodeData(data.id, {
                modelParams: value
              } as LLMNode)
            } catch (e) {
            }
          }}
        />
      }
      <div className='flex items-center w-full justify-between pt-2 border-t'>
        <Label className='mr-2'>Chat messages input</Label>
        <Switch
          disabled={!editable}

          checked={data.inputs.some(input => input.name === 'chat_messages' && input.type === NodeHandleType.CHAT_MESSAGE_LIST)}
          onCheckedChange={(checked) => {

            if (checked) {

              updateNodeData(data.id, {
                inputs: [{
                  id: v4(),
                  name: 'chat_messages',
                  type: NodeHandleType.CHAT_MESSAGE_LIST
                },
                ...data.inputs]
              } as LLMNode)
            } else {
              dropEdgeForHandle(
                data
                  .inputs
                  .find(input => input.name === 'chat_messages' && input.type === NodeHandleType.CHAT_MESSAGE_LIST)
                  ?.id!
              );
              updateNodeData(data.id, {
                inputs: [
                  ...data.inputs.filter(input => !(input.name === 'chat_messages' && input.type === NodeHandleType.CHAT_MESSAGE_LIST))
                ]
              } as unknown as LLMNode)

            }
          }}
        />
      </div>
      <div className='flex items-center w-full justify-between pt-2 border-t'>
        <Label className='mr-2'>Chat messages output</Label>
        <Switch
          disabled={!editable}

          checked={data.outputs[0].type === NodeHandleType.CHAT_MESSAGE_LIST}
          onCheckedChange={(checked) => {
            dropEdgeForHandle(data.outputs[0].id);
            if (checked) {
              updateNodeData(data.id, {
                outputs: [{
                  id: v4(),
                  name: 'messages',
                  type: NodeHandleType.CHAT_MESSAGE_LIST
                }]
              } as LLMNode)
            } else {
              updateNodeData(data.id, {
                outputs: [{
                  id: v4(),
                  name: 'output',
                  type: NodeHandleType.STRING
                }]
              } as LLMNode)
            }
          }}
        />
      </div>
      <div className='border-t pt-2'>
        <StructuredOutputFields editable={editable} data={data} />
      </div>
      <div className='flex items-center w-full justify-between border-t pt-2'>
        <Label className='mr-2'>Stream</Label>
        <Switch
          disabled={!editable}
          checked={data.stream ?? false}
          onCheckedChange={(checked) => {
            updateNodeData(data.id, {
              stream: checked,
            } as LLMNode)
          }}
        />
      </div>
    </div>
  )
};
