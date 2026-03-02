"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { cn } from "@/lib/utils";

export interface EvalScoreData {
  evaluationId: string;
  evaluationName: string;
  scores: {
    name: string;
    average: number;
    min: number;
    max: number;
    distribution: number[];
  }[];
  totalDatapoints: number;
  passRate?: number;
}

function MiniDistribution({ distribution }: { distribution: number[] }) {
  const max = Math.max(...distribution, 1);
  return (
    <div className="flex items-end gap-px h-6">
      {distribution.map((val, i) => (
        <div
          key={i}
          className="w-1.5 bg-primary/40 rounded-t-sm min-h-[1px]"
          style={{ height: `${(val / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

function ScoreBar({ value, min, max }: { value: number; min: number; max: number }) {
  const range = max - min || 1;
  const position = ((value - min) / range) * 100;

  return (
    <div className="relative h-2 bg-muted rounded-full overflow-hidden">
      <div className="absolute h-full bg-primary/30 rounded-full" style={{ width: `${position}%` }} />
      <div className="absolute w-1.5 h-2 bg-primary rounded-full -translate-x-1/2" style={{ left: `${position}%` }} />
    </div>
  );
}

export function EvalScoreCard({ data }: { data: EvalScoreData }) {
  const { projectId } = useParams();

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium truncate">{data.evaluationName}</span>
          <span className="text-[10px] text-muted-foreground flex-none">{data.totalDatapoints} datapoints</span>
        </div>
        <Link
          href={`/project/${projectId}/evaluations/${data.evaluationId}`}
          className="flex items-center gap-1 text-[10px] text-primary hover:underline flex-none"
        >
          Open <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Pass rate bar */}
      {data.passRate != null && (
        <div className="px-3 py-2 border-b">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">Pass Rate</span>
            <span className="text-xs font-semibold font-mono">{(data.passRate * 100).toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                data.passRate >= 0.8
                  ? "bg-green-500/60"
                  : data.passRate >= 0.5
                    ? "bg-yellow-500/60"
                    : "bg-destructive/60"
              )}
              style={{ width: `${data.passRate * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Scores */}
      <div className="divide-y">
        {data.scores.map((score) => (
          <div key={score.name} className="px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium">{score.name}</span>
              <span className="text-xs font-semibold font-mono">{score.average.toFixed(3)}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <ScoreBar value={score.average} min={score.min} max={score.max} />
                <div className="flex justify-between mt-0.5">
                  <span className="text-[9px] text-muted-foreground font-mono">{score.min.toFixed(2)}</span>
                  <span className="text-[9px] text-muted-foreground font-mono">{score.max.toFixed(2)}</span>
                </div>
              </div>
              {score.distribution.length > 0 && (
                <div className="flex-none">
                  <MiniDistribution distribution={score.distribution} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
