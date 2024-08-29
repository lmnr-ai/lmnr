'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Info, Loader, Plus } from 'lucide-react';
import { cn, getLocalDevSessions, getLocalEnvVars } from '@/lib/utils';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DatasetSelect from '../ui/dataset-select';
import { useProjectContext } from '@/contexts/project-context';
import PipelineSelect from '../ui/pipeline-select';
import { Switch } from '../ui/switch';
import { DisplayableGraph, GenericNode } from '@/lib/flow/types';


export default function CreateEvaluationDialog() {
  const { projectId } = useProjectContext();
  const env = getLocalEnvVars(projectId);
  const devSessionIds = getLocalDevSessions
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  const [name, setName] = useState<string>('');
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [evaluatorPipelineVersionId, setEvaluatorPipelineVersionId] = useState<string | null>(null);
  const [evaluatorPipelineId, setEvaluatorPipelineId] = useState<string | null>(null);
  const [evaluatorPipelineGraph, setEvaluatorPipelineGraph] = useState<DisplayableGraph | null>(null);

  const [enableExecutorPipeline, setEnableExecutorPipeline] = useState(true);
  const [executorPipelineVersionId, setExecutorPipelineVersionId] = useState<string | null>(null);
  const [executorPipelineId, setExecutorPipelineId] = useState<string | null>(null);
  const [executorPipelineGraph, setExecutorPipelineGraph] = useState<DisplayableGraph | null>(null);

  const createNewEvaluation = async () => {
    setIsLoading(true);

    const res = await fetch(`/api/projects/${projectId}/evaluations/`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        datasetId,
        executorPipelineVersionId: enableExecutorPipeline ? executorPipelineVersionId : null,
        evaluatorPipelineVersionId,
        env,
        devSessionIds,
      }),
    });
    const json = await res.json();
    setName('');
    setDatasetId(null);
    setEvaluatorPipelineVersionId(null);
    setExecutorPipelineVersionId(null);
    setEnableExecutorPipeline(true);
    setIsLoading(false);
    setIsDialogOpen(false);
    router.push(`/project/${projectId}/evaluations/${json.id}`);
  }

  const isEvaluationComplete = (): boolean => {
    const isExecutorPipelineComplete = enableExecutorPipeline ? executorPipelineId != null && executorPipelineVersionId != null : true;
    return isExecutorPipelineComplete && name.trim().length > 0 && datasetId != null && evaluatorPipelineVersionId != null;
  }

  // const extractNodeNames = (graph: DisplayableGraph | null, nodeType: string): string[] | null => {
  //   if (graph == null) {
  //     return null;
  //   }
  //   const nodes = graph.nodes.filter((node) => node.type === nodeType);
  //   return nodes.map(node => (node.data as GenericNode).name);
  // }
  // const executorInputNames = extractNodeNames(executorPipelineGraph, 'Input');
  // const executorOutputNames = extractNodeNames(executorPipelineGraph, 'Output');
  // const evaluatorInputNames = extractNodeNames(evaluatorPipelineGraph, 'Input');

  return (
    <>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="default">
            New evaluation
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create new evaluation</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label>Name</Label>
            <Input
              autoFocus
              placeholder="Name"
              onChange={(e) => setName(e.target.value)}
            />
            <div className='flex items-center w-full justify-between'>
              <Label>Executor Pipeline</Label>
              <Switch
                checked={enableExecutorPipeline}
                onCheckedChange={setEnableExecutorPipeline}
              />
            </div>
            {enableExecutorPipeline && (
              <div className='flex flex-col space-y-2'>
                <PipelineSelect
                  onPipelineVersionChange={(pipelineVersion) => {
                    setExecutorPipelineVersionId(pipelineVersion?.id ?? null)
                    setExecutorPipelineGraph(pipelineVersion?.displayableGraph ?? null)
                  }}
                  onPipelineChange={(pipeline) => {
                    setExecutorPipelineId(pipeline.id ?? null)
                  }}
                  defaultPipelineId={executorPipelineId ?? undefined}
                  defaultPipelineVersionId={executorPipelineVersionId ?? undefined}
                  hideWorkshopVersions
                />
                {/* {executorInputNames != null && (
                  <div className='flex items-center'>
                    <Info size={11} className='text-secondary-foreground mx-1' />
                    <Label className='text-secondary-foreground text-xs'>Executor input nodes: {executorInputNames.join(", ")}</Label>
                  </div>
                )}
                {executorOutputNames != null && (
                  <div className='flex items-center'>
                    <Info size={11} className='text-secondary-foreground mx-1' />
                    <Label className='text-secondary-foreground text-xs'>Executor output nodes: {executorOutputNames.join(", ")}</Label>
                  </div>
                )} */}
              </div>
            )}
            <Label>Evaluator Pipeline</Label>
            <PipelineSelect
              onPipelineVersionChange={(pipelineVersion) => {
                setEvaluatorPipelineVersionId(pipelineVersion?.id ?? null);
                setEvaluatorPipelineGraph(pipelineVersion?.displayableGraph ?? null);
              }}
              onPipelineChange={(pipeline) => {
                if (pipeline.id !== evaluatorPipelineId) {
                  setEvaluatorPipelineVersionId(null);
                  setEvaluatorPipelineGraph(null);
                }
                setEvaluatorPipelineId(pipeline.id ?? null);
              }}
              hideWorkshopVersions
            />
            {/* {evaluatorInputNames && (
              <div className='flex items-center'>
                <Info size={11} className='text-secondary-foreground mx-1' />
                <Label className='text-secondary-foreground text-xs'>Evaluator input nodes: {evaluatorInputNames.join(", ")}</Label>
              </div>
            )} */}
            <Label>Dataset</Label>
            <DatasetSelect onDatasetChange={(dataset) => setDatasetId(dataset.id)} />
          </div>
          <DialogFooter>
            <Button
              onClick={createNewEvaluation}
              disabled={!isEvaluationComplete() || isLoading}
            >
              <Loader className={cn('mr-2 hidden', isLoading ? 'animate-spin block' : '')} size={16} />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
