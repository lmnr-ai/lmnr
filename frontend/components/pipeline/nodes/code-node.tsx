import { memo } from 'react'
import GenericNodeComponent from './generic-node'
import { CodeNode } from '@/lib/flow/types'
import useStore from '@/lib/flow/store';
import { useUpdateNodeInternals } from 'reactflow';

const pythonFunctionPattern = /def\s+(\w+)\s*\(([^)]*)\)/;

const compareArrays = (array1: string[], array2: string[]): boolean => {
  return array1.length === array2.length && array1.every((value, index) => value === array2[index]);

}

const CodeNodeComponent = ({
  id,
  data,
}: {
  id: string;
  data: CodeNode;
}) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const dropEdgeForHandle = useStore((state) => state.dropEdgeForHandle);
  const updateNodeInternals = useUpdateNodeInternals();
  const setFocusedNodeId = useStore((state) => state.setFocusedNodeId);

  return (
    <GenericNodeComponent id={id} data={data} className='w-60'>
      {/* <div className='mt-2 h-[400px] nowheel nodrag'>
        <Ide
          value={data.code}
          mode={"python"}
          tabSize={4}
          onChange={(code) => {
            const match = pythonFunctionPattern.exec(code);
            if (match) {
              const fnName = match[1];
              const args = match[2].split(',').map(arg => arg.trim()).filter((c) => c !== '');

              let newNodeData = {
                code: code,
                fnName: fnName
              } as CodeNode;

              let prevArgs = data.inputs.map((input) => input.name) as string[];
              if (!compareArrays(prevArgs, args)) {

                // drop all edges connected to the inputs
                for (const input of data.inputs) {
                  dropEdgeForHandle(input.id);
                }

                // generate new inputs
                newNodeData.inputs = args.map((arg) => ({
                  id: v4(),
                  name: arg,
                  type: NodeHandleType.ANY
                }));
              }

              updateNodeData(id, newNodeData);
              updateNodeInternals(id);
            } else {
              // TODO: Show error message to user
              
            }
          }} />
      </div> */}
    </GenericNodeComponent >
  );
};

export default memo(CodeNodeComponent);
