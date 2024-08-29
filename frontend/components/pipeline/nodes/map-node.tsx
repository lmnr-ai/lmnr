import {
  GenericNodeHandle,
  InputNode,
  NodeType,
  RunnableGraph,
  MapNode,
} from '@/lib/flow/types';
import { Label } from '@/components/ui/label';
import useStore from '@/lib/flow/store';
import PipelineSelect from '@/components/ui/pipeline-select';

export default function MapNodeComponent({
  data
}: {
  data: MapNode;
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
          } as MapNode)
        }}
        onPipelineVersionChange={(pv) => {
          if (pv !== null) {
            updateNodeData(data.id, {
              pipelineVersionName: pv.name,
              pipelineVersionId: pv.id,
              runnableGraph: pv.runnableGraph
            } as MapNode)
          } else {
            updateNodeData(data.id, {
              pipelineVersionName: '',
              pipelineVersionId: null,
              runnableGraph: { nodes: {}, pred: {} } as RunnableGraph
            } as MapNode);
          }
        }}
      />
    </div>
  )
};
