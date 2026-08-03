"use client";

import { ArrowRight } from "lucide-react";
import { useMemo } from "react";

import { formatCostIntl, isValidScore } from "@/components/evaluation/utils";
import ContentRenderer from "@/components/ui/content-renderer";
import { type EvalRow } from "@/lib/evaluation/types";
import { formatTokensCompact } from "@/lib/traces/format";

import MetricDelta from "./metric-delta";

interface DatapointComparisonProps {
  /** The selected row, carrying both runs' values (`x` and `compared:x`). */
  row?: EvalRow;
  scoreNames: string[];
  /** Resolved score directions (name -> isHigherBetter). Absent = higher better. */
  scoreDirections?: Record<string, boolean>;
  /** Display names for the two runs, for column headers. */
  currentName?: string;
  comparedName?: string;
}

// ClickHouse can hand back a numeric column as a string (Int64/Decimal), so
// coerce before validating rather than type-guarding the raw value.
const num = (v: unknown): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown): string => {
  if (v == null) return "";
  return typeof v === "string" ? v : JSON.stringify(v);
};

/**
 * Side-by-side comparison of ONE datapoint across two runs.
 *
 * Reads the `compared:*` keys the comparison query's LEFT JOIN already puts on
 * the row (joined on `index`), so this needs no extra fetch. A datapoint index
 * present in the primary run but absent from the compared run has no
 * `compared:*` values — every field then renders as "—" rather than a zero,
 * which would read as a real regression.
 */
export default function DatapointComparison({
  row,
  scoreNames,
  scoreDirections,
  currentName,
  comparedName,
}: DatapointComparisonProps) {
  const scoreRows = useMemo(
    () =>
      [...scoreNames]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
          name,
          current: num(row?.[`score:${name}`]),
          compared: num(row?.[`compared:score:${name}`]),
          isHigherBetter: scoreDirections?.[name] ?? true,
        }))
        // Drop scores neither run produced — an all-"—" row is pure noise.
        .filter((s) => isValidScore(s.current) || isValidScore(s.compared)),
    [scoreNames, scoreDirections, row]
  );

  if (!row) return null;

  const output = str(row["output"]);
  const comparedOutput = str(row["compared:output"]);

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
        <span className="truncate font-medium text-muted-foreground" title={comparedName}>
          {comparedName ?? "Compared run"}
        </span>
        <ArrowRight size={12} className="shrink-0 text-muted-foreground" />
        <span className="truncate font-medium" title={currentName}>
          {currentName ?? "This run"}
        </span>
      </div>

      {scoreRows.length > 0 && (
        <Section title="Scores">
          {scoreRows.map((s) => (
            <MetricDelta
              key={s.name}
              label={s.name}
              current={s.current}
              compared={s.compared}
              isHigherBetter={s.isHigherBetter}
            />
          ))}
        </Section>
      )}

      <Section title="Cost & tokens">
        <MetricDelta
          label="Cost"
          current={num(row["cost"])}
          compared={num(row["compared:cost"])}
          format={formatCostIntl}
          isHigherBetter={false}
        />
        <MetricDelta
          label="Total tokens"
          current={num(row["totalTokens"])}
          compared={num(row["compared:totalTokens"])}
          format={formatTokensCompact}
          isHigherBetter={false}
        />
        <MetricDelta
          label="Input tokens"
          current={num(row["inputTokens"])}
          compared={num(row["compared:inputTokens"])}
          format={formatTokensCompact}
          isHigherBetter={false}
        />
        <MetricDelta
          label="Output tokens"
          current={num(row["outputTokens"])}
          compared={num(row["compared:outputTokens"])}
          format={formatTokensCompact}
          isHigherBetter={false}
        />
        <MetricDelta
          label="Cache input tokens"
          current={num(row["cacheReadInputTokens"])}
          compared={num(row["compared:cacheReadInputTokens"])}
          format={formatTokensCompact}
          isHigherBetter
        />
        <MetricDelta
          label="Reasoning tokens"
          current={num(row["reasoningTokens"])}
          compared={num(row["compared:reasoningTokens"])}
          format={formatTokensCompact}
          isHigherBetter={false}
        />
        <MetricDelta
          label="Duration"
          current={num(row["duration"])}
          compared={num(row["compared:duration"])}
          format={(v) => `${v.toFixed(2)}s`}
          isHigherBetter={false}
        />
      </Section>

      {(output || comparedOutput) && (
        <Section title="Output">
          <div className="grid grid-cols-2 gap-2">
            <Payload value={comparedOutput} />
            <Payload value={output} />
          </div>
        </Section>
      )}
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-muted-foreground">{title}</span>
    <div className="flex flex-col gap-1">{children}</div>
  </div>
);

const Payload = ({ value }: { value: string }) => (
  <div className="min-w-0 overflow-hidden rounded-md border bg-muted/30 p-2 text-xs">
    {value ? (
      <ContentRenderer value={value} presetKey="eval-datapoint-comparison" modes={["TEXT", "JSON", "YAML"]} />
    ) : (
      <span className="text-muted-foreground">—</span>
    )}
  </div>
);
