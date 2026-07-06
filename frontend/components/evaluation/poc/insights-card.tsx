"use client";

import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { generateMockInsights } from "@/components/evaluation/poc/mock-insights";
import { Button } from "@/components/ui/button";
import { type EvalRow } from "@/lib/evaluation/types";

interface InsightsCardProps {
  rows?: EvalRow[];
  primaryScore?: string;
  onSelectRow: (row: EvalRow) => void;
}

/**
 * V5: mocked LLM pattern summaries over the worst datapoints. Loudly labeled a
 * mock — teammates screenshot things, and this must never be mistaken for real
 * analysis. Chips select REAL rows so the pattern→datapoint→trace loop is
 * judgeable with honest interaction cost.
 */
export default function InsightsCard({ rows, primaryScore, onSelectRow }: InsightsCardProps) {
  const [open, setOpen] = useState(true);
  const patterns = useMemo(() => generateMockInsights(rows ?? [], primaryScore), [rows, primaryScore]);

  if (!patterns.length) return null;

  return (
    <div className="flex-none border-b border-dashed border-amber-500/50 bg-amber-500/5">
      <div className="flex items-center gap-1.5 px-2.5 pt-2">
        <Sparkles className="size-3.5 text-amber-500" />
        <span className="text-xs font-medium">Patterns</span>
        <span className="rounded border border-dashed border-amber-500/60 px-1 text-[0.6rem] uppercase tracking-wide text-amber-500">
          Mock preview
        </span>
        <Button variant="ghost" size="icon" className="ml-auto size-5" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </Button>
      </div>
      {open ? (
        <div className="flex flex-col gap-2 px-2.5 pb-2 pt-1">
          {patterns.map((p) => (
            <div key={p.id}>
              <p className="text-xs font-medium">{p.title}</p>
              <p className="pb-1 text-[0.7rem] leading-4 text-muted-foreground">{p.summary}</p>
              <div className="flex flex-wrap gap-1">
                {p.rows.map((row) => (
                  <button
                    key={String(row["id"])}
                    onClick={() => onSelectRow(row)}
                    className="rounded border bg-secondary px-1.5 py-px text-[0.7rem] tabular-nums hover:bg-muted"
                  >
                    #{String(row["index"] ?? "?")}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[0.65rem] italic text-muted-foreground">
            Not real analysis — fabricated copy over your real lowest-scoring rows to preview the feature shape.
          </p>
        </div>
      ) : (
        <div className="pb-1.5" />
      )}
    </div>
  );
}
