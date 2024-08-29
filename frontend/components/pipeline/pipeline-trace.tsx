import { Button } from '@/components/ui/button';
import useStore from '@/lib/flow/store';
import { InputNode, NodeHandleType, NodeType } from '@/lib/flow/types';
import PipelineInput from './pipeline-input';
import { ScrollArea } from '../ui/scroll-area';
import { AiOutlineMinusCircle } from 'react-icons/ai';
import { DEFAULT_INPUT_VALUE_FOR_HANDLE_TYPE } from '@/lib/flow/utils';
import { v4 as uuidv4 } from 'uuid'
import { PipelineExecutionMode } from '@/lib/pipeline/types';

interface PipelineTraceProps {
}

export default function PipelineTrace({ }: PipelineTraceProps) {
  const nodes = useStore(state => state.nodes);
  const { mode, allInputs, setAllInputs, getRunGraph, focusedNodeId } = useStore();

  const deleteInput = (index: number) => {
    setAllInputs(allInputs.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex flex-grow h-0 w-full overflow-y-auto">
        {allInputs.map((inputs, i) => (
          <div key={(inputs.length > 0) ? inputs[0].executionId : 'unreachable'}>
            {allInputs.length > 1 && <div className="flex flex-none h-14 justify-between items-center p-4">
              <h4 className="text-base font-medium">Execution {i + 1} inputs</h4>
              <div className="pt-2">
                <button className="w-8 group-hover:block" onClick={() => deleteInput(i)}>
                  <AiOutlineMinusCircle className="text-gray-600" />
                </button>
              </div>
            </div>}

            <PipelineInput inputs={inputs} onInputsChange={inputs => {
              const newInputs = [...allInputs];
              newInputs[i] = inputs;
              setAllInputs(newInputs);
            }} />
          </div>
        ))}
        {/* {allInputs.length > 0 && allInputs[0].length > 0 &&
          <Button
            variant="secondary"
            className="h-6 m-4"
            onClick={() => {
              let inputNodes

              if (mode === PipelineExecutionMode.Node && focusedNodeId) {
                inputNodes = Array.from(getRunGraph().nodes.values()).filter(node => node.type === NodeType.INPUT) as InputNode[];
              } else {
                // Private pipelines will only come here if they are not in Unit test mode
                // Public pipelines don't have Unit test mode and will always come here
                inputNodes = nodes.filter(
                  (node) => node.type == NodeType.INPUT
                ).map((node) => node.data as InputNode);
              }

              const newInput = inputNodes.map(node => ({
                id: node.id,
                name: node.name,
                value: DEFAULT_INPUT_VALUE_FOR_HANDLE_TYPE[node.inputType as NodeHandleType],
                type: node.inputType,
                executionId: uuidv4(),
              }));
              return setAllInputs([...allInputs, newInput])
            }}
          >
            Add parallel execution
          </Button>
        } */}
      </ScrollArea>
    </div>
  );
}
