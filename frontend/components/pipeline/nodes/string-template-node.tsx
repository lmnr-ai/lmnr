import GenericNodeComponent from './generic-node';
import useStore from '@/lib/flow/store';
import {
  type StringTemplateNode,
  type GenericNodeHandle
} from '@/lib/flow/types';
import { useUpdateNodeInternals } from 'reactflow';
import { Label } from '@/components/ui/label';
import TemplatedTextArea from './components/templated-text-area';
import Ide from '@/components/ui/ide';

const StringTemplateNodeComponent = ({
  data
}: {
  data: StringTemplateNode;
}) => {

  const updateNodeData = useStore((state) => state.updateNodeData);
  const dropEdgeForHandle = useStore((state) => state.dropEdgeForHandle);

  const id = data.id;
  const defaultInputs = new Map<string, GenericNodeHandle>(data.dynamicInputs?.map((input) => [input.name!, input]) ?? []);

  return (
    <>
      <div className='flex flex-col p-4 space-y-2'>
        <div className='flex flex-col'>
          <Label>String template</Label>
        </div>
        <TemplatedTextArea
          className='w-full nowheel nodrag'
          value={data.text}
          defaultInputs={defaultInputs}
          placeholder='String template'
          onUpdate={(value, inputs, edgeIdsToRemove) => {
            updateNodeData(id, {
              dynamicInputs: inputs,
              text: value
            } as StringTemplateNode)

            edgeIdsToRemove.forEach((id) => {
              dropEdgeForHandle(id);
            });

          }}
        />
      </div>
    </>
  );
};

export default StringTemplateNodeComponent;
