import { useProjectContext } from "@/contexts/project-context";
import { EvaluationDatapoint, EvaluationDatapointPreview, EvaluationDatapointPreviewWithCompared } from "@/lib/evaluation/types";
import { ChevronsRight } from "lucide-react";
import { Skeleton } from "../ui/skeleton";
import Ide from "../ui/ide";
import TraceCards from "../traces/trace-cards";
import { Label } from "../ui/label";
import { ScrollArea } from "../ui/scroll-area";
import { Button } from "../ui/button";
import Mono from "../ui/mono";
import useSWR from "swr";
import { swrFetcher } from "@/lib/utils";
import EvaluationDatapointErr from "./evaluation-datapoint-error";
import React, { useEffect } from "react";
import { RunTrace } from "@/lib/traces/types";
import { Separator } from "../ui/separator";

interface EvaluationPanelProps {
  datapointPreview: EvaluationDatapointPreviewWithCompared;
  onClose: () => void;
}

function DatapointWithTraces({ datapoint, executorTrace, evaluatorTrace }: { datapoint: EvaluationDatapoint, executorTrace: RunTrace | null, evaluatorTrace: RunTrace | null }) {

  return (
    <ScrollArea className="flex-grow flex overflow-auto">
      <div className="flex max-h-0">
        <div className="flex-grow flex flex-col space-y-4 p-4 h-full">
          <Label className="">Data</Label>
          <Ide mode="json" value={JSON.stringify(datapoint.data, null, 2)} readOnly maxLines={Infinity} className="min-h-2" />
          <Label className="">Target</Label>
          <Ide mode="json" value={JSON.stringify(datapoint.target, null, 2)} readOnly maxLines={Infinity} className="min-h-2" />
          <Label className="">Executor Output</Label>
          <Ide mode="json" value={JSON.stringify(datapoint.executorOutput, null, 2)} readOnly maxLines={Infinity} className="min-h-2" />
          {
            !!datapoint.error && (
              <EvaluationDatapointErr datapoint={datapoint} />
            )
          }
        </div>
      </div>
    </ScrollArea>
  )
}

export default function EvaluationPanel({ datapointPreview, onClose }: EvaluationPanelProps) {
  const { projectId } = useProjectContext();
  // datapoint is EvaluationDatapoint, i.e. result of one execution on a data point
  const { data: datapoint }: { data: EvaluationDatapoint } = useSWR(`/api/projects/${projectId}/evaluations/${datapointPreview.evaluationId}/datapoints/${datapointPreview.id}`, swrFetcher);
  const { data: comparedDatapoint }: { data: EvaluationDatapoint } = useSWR(`/api/projects/${projectId}/evaluations/${datapointPreview.comparedEvaluationId}/datapoints/${datapointPreview.comparedId}`, swrFetcher);

  const [executorTrace, setExecutorTrace] = React.useState<RunTrace | null>(null);
  const [evaluatorTrace, setEvaluatorTrace] = React.useState<RunTrace | null>(null);
  const [comparedExecutorTrace, setComparedExecutorTrace] = React.useState<RunTrace | null>(null);
  const [comparedEvaluatorTrace, setComparedEvaluatorTrace] = React.useState<RunTrace | null>(null);

  // useEffect(() => {
  //   if (datapoint) {
  //     fetch(`/api/projects/${projectId}/traces/trace/${datapoint.executorTrace?.runId}`).then((res) => res.json()).then((data) => {
  //       setExecutorTrace(data);
  //     });
  //     fetch(`/api/projects/${projectId}/traces/trace/${datapoint.evaluatorTrace?.runId}`).then((res) => res.json()).then((data) => {
  //       setEvaluatorTrace(data);
  //     });
  //   }
  // }, [datapoint]);

  // useEffect(() => {
  //   if (comparedDatapoint) {
  //     fetch(`/api/projects/${projectId}/traces/trace/${comparedDatapoint.executorTrace?.runId}`).then((res) => res.json()).then((data) => {
  //       setComparedExecutorTrace(data);
  //     });
  //     fetch(`/api/projects/${projectId}/traces/trace/${comparedDatapoint.evaluatorTrace?.runId}`).then((res) => res.json()).then((data) => {
  //       setComparedEvaluatorTrace(data);
  //     });
  //   }
  // }, [comparedDatapoint]);

  return (<div className='flex flex-col h-full w-full'>
    <div className='h-14 flex flex-none space-x-2 pl-3 items-center border-b'>
      <Button
        variant={'ghost'}
        className='px-1'
        onClick={onClose}
      >
        <ChevronsRight />
      </Button>
      <div>
        Run
      </div>
      <Mono className='text-secondary-foreground'>
        {datapointPreview.id}
      </Mono>
    </div>
    <div className="flex-grow flex flex-row mx-2">
      {datapoint &&
        <DatapointWithTraces datapoint={datapoint} executorTrace={executorTrace} evaluatorTrace={evaluatorTrace} />
      }

      {
        !datapoint && (
          <div className="flex-grow w-full p-4 space-y-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        )
      }

      {comparedDatapoint && <Separator orientation="vertical" className="text-gray-500" />}

      {comparedDatapoint && (
        <DatapointWithTraces datapoint={comparedDatapoint} executorTrace={comparedExecutorTrace} evaluatorTrace={comparedEvaluatorTrace} />
      )}

    </div>
  </div>
  )
}
