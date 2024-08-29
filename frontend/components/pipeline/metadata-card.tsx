import { RunTrace } from "@/lib/traces/types";
import { Card } from "../ui/card";
import StatusLabel from "../ui/status-label";
import { Label } from "../ui/label";
import { getDurationString } from "@/lib/flow/utils";

export default function MetadataCard({ runTrace }: { runTrace: RunTrace }) {
  return (
    <Card className="my-2 p-4">
      <div className="flex flex-col space-y-2">
        <StatusLabel success={runTrace.success} />
        <Label className="flex my-1">Total runtime: {getDurationString(runTrace.startTime, runTrace.endTime)}</Label>
        <Label className="flex my-1">Token count: {runTrace.totalTokenCount}</Label>
        <Label className="flex my-1">Estimated cost: {runTrace.approximateCost !== null ? `$${runTrace.approximateCost.toFixed(5)}` : 'Unknown'}</Label>
      </div>
    </Card>
  )
}