"use client";

import { BarChart3, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import type { EvalScoreCardData } from "./types";

function MiniBarChart({
  distribution,
  maxCount,
}: {
  distribution: { bucket: string; count: number }[];
  maxCount: number;
}) {
  return (
    <div className="flex items-end gap-px h-8">
      {distribution.map((bucket, i) => {
        const height = maxCount > 0 ? Math.max(2, (bucket.count / maxCount) * 100) : 0;
        return (
          <div key={i} className="flex-1 group relative flex flex-col items-center justify-end">
            <div
              className="w-full bg-primary/40 rounded-t-sm min-w-[3px] transition-colors group-hover:bg-primary/70"
              style={{ height: `${height}%` }}
            />
            {/* Tooltip on hover */}
            <div className="absolute -top-5 opacity-0 group-hover:opacity-100 transition-opacity bg-background border rounded px-1 py-0.5 shadow-sm z-10 whitespace-nowrap pointer-events-none">
              <span className="text-[8px] font-mono">
                {bucket.bucket}: {bucket.count}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatScore(value: number): string {
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function EvalScoreCardComponent({ data }: { data: EvalScoreCardData }) {
  const { projectId } = useParams();

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium">{data.evaluationName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">{data.totalDatapoints} datapoints</span>
          <Link
            href={`/project/${projectId}/evaluations/${data.evaluationId}`}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            Open <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        </div>
      </div>

      {/* Score cards */}
      <div className="divide-y">
        {data.scores.map((score, index) => {
          const maxDistCount = Math.max(...score.distribution.map((d) => d.count), 1);

          return (
            <div key={index} className="px-3 py-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">{score.name}</span>
                <span className="text-xs font-mono font-semibold text-primary">avg {formatScore(score.average)}</span>
              </div>

              {/* Mini bar chart */}
              <MiniBarChart distribution={score.distribution} maxCount={maxDistCount} />

              {/* Stats row */}
              <div className="flex items-center justify-between mt-1.5 gap-2">
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                  <span>
                    min <span className="text-foreground font-medium">{formatScore(score.min)}</span>
                  </span>
                  <span>
                    med <span className="text-foreground font-medium">{formatScore(score.median)}</span>
                  </span>
                  <span>
                    max <span className="text-foreground font-medium">{formatScore(score.max)}</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="px-3 py-2 border-t bg-muted/10">
        <p className="text-[11px] text-muted-foreground leading-relaxed">{data.summary}</p>
      </div>
    </div>
  );
}
