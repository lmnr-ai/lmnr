import {
  GenericNodeHandle,
  InputNode,
  NodeType,
  RunnableGraph,
  SubpipelineNode,
} from '@/lib/flow/types';
import { Label } from '@/components/ui/label';
import useStore from '@/lib/flow/store';
import PipelineSelect from '@/components/ui/pipeline-select';

export default function SubpipelineNodeComponent({
  data
}: {
  data: SubpipelineNode;
}) {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const dropEdgeForHandle = useStore((state) => state.dropEdgeForHandle);

  return (
    <div className='p-4 flex flex-col space-y-2'>
      <Label>Committed pipeline version</Label>
      <PipelineSelect
        hideWorkshopVersions={true}
        defaultPipelineName={data.pipelineName.length > 0 ? data.pipelineName : undefined}
        defaultPipelineId={data.pipelineId ?? undefined}
        defaultPipelineVersionName={data.pipelineVersionName.length > 0 ? data.pipelineVersionName : undefined}
        onPipelineChange={(pipeline) => {
          updateNodeData(data.id, {
            pipelineName: pipeline.name,
            pipelineId: pipeline.id
          } as SubpipelineNode)
        }}
        onPipelineVersionChange={(pv) => {
          data.inputs.forEach((input) => {
            dropEdgeForHandle(input.id);
          })

          if (pv !== null) {
            updateNodeData(data.id, {
              inputs: Object.values(pv.runnableGraph.nodes).filter((node) => node.type === NodeType.INPUT).map((node) => ({
                id: node.id,
                name: node.name,
                type: (node as InputNode).inputType
              } as GenericNodeHandle)),
              pipelineVersionName: pv.name,
              pipelineVersionId: pv.id,
              runnableGraph: pv.runnableGraph
            } as SubpipelineNode)
          } else {
            updateNodeData(data.id, {
              inputs: [] as GenericNodeHandle[],
              pipelineVersionName: '',
              pipelineVersionId: null,
              runnableGraph: { nodes: {}, pred: {} } as RunnableGraph
            } as SubpipelineNode);
          }
        }}
      />
    </div>
  )
};
