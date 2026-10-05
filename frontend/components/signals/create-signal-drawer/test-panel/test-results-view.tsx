"use client";

import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { CircleCheck, CircleSlash, Loader2, TriangleAlert } from "lucide-react";
import { useParams } from "next/navigation";
import { type ReactNode } from "react";

import { type SchemaField } from "@/components/signals/utils";
import { renderSpanReferences, type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import { Badge } from "@/components/ui/badge";
import { theme } from "@/components/ui/content-renderer/utils";
import { SEVERITY_LABELS } from "@/lib/actions/alerts/types";
import { type SignalTestResult } from "@/lib/actions/signals/execute";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import PayloadValue from "./payload-value";
import useTestSpanRefs from "./use-test-span-refs";

const SEVERITY_STYLES: Record<number, string> = {
  0: "text-muted-foreground/60",
  1: "text-orange-400/80",
  2: "text-red-400/100",
};

function StatusLine({ icon, label, className }: { icon: ReactNode; label: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-sm font-medium", className)}>
      {icon}
      {label}
    </div>
  );
}

function RunStats({ stats }: { stats: SignalTestResult["stats"] }) {
  const parts = [
    stats.model,
    `${(stats.durationMs / 1000).toFixed(1)}s`,
    `${stats.stepsTaken} ${stats.stepsTaken === 1 ? "step" : "steps"}`,
    `${stats.totalTokens.toLocaleString()} tokens`,
    ...(stats.totalCostUsd > 0 ? [`$${stats.totalCostUsd.toFixed(4)}`] : []),
  ].filter(Boolean);
  return <div className="text-xs text-muted-foreground">{parts.join(" · ")}</div>;
}

function Attributes({
  attributes,
  schemaFields,
  spanRefCallbacks,
}: {
  attributes: Record<string, unknown>;
  schemaFields: SchemaField[];
  spanRefCallbacks: SpanReferenceCallbacks;
}) {
  const validFields = schemaFields.filter((f) => f.name.trim());
  if (validFields.length === 0) {
    return (
      <div className="border rounded-md bg-muted/50 overflow-hidden">
        <CodeMirror
          readOnly
          value={JSON.stringify(attributes, null, 2)}
          extensions={[json(), EditorView.lineWrapping]}
          theme={theme}
        />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {validFields.map((field) => (
        <div key={field.name} className="rounded-md border bg-secondary/50 px-3 py-2">
          <div className="text-xs text-muted-foreground mb-1">{field.name}</div>
          <div className="text-sm">
            <PayloadValue value={attributes[field.name]} field={field} spanRefCallbacks={spanRefCallbacks} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TestResultsView({
  result,
  trace,
  error,
  isExecuting,
  schemaFields,
}: {
  result: SignalTestResult | null;
  trace: TraceRow | null;
  error: string | null;
  isExecuting: boolean;
  schemaFields: SchemaField[];
}) {
  const { projectId } = useParams();
  const spanRefCallbacks = useTestSpanRefs(String(projectId), trace);

  if (isExecuting) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Testing signal... this may take some time.</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3">
        <StatusLine icon={<TriangleAlert className="size-4" />} label="Test failed" className="text-destructive" />
        <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words">{error}</p>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
      {result.result === "event" && (
        <>
          <div className="flex items-center justify-between gap-2">
            <StatusLine icon={<CircleCheck className="size-4 text-primary" />} label="Event identified" />
            <Badge
              variant="outline"
              className={cn("rounded-full font-medium", SEVERITY_STYLES[result.finding.severity] ?? SEVERITY_STYLES[0])}
            >
              {SEVERITY_LABELS[result.finding.severity as keyof typeof SEVERITY_LABELS] ?? "Info"}
            </Badge>
          </div>
          {result.finding.summaries.length > 0 && (
            <ul className="list-disc pl-5 space-y-1 text-sm text-secondary-foreground">
              {result.finding.summaries.map((summary, i) => (
                <li key={i}>{renderSpanReferences(summary, spanRefCallbacks) ?? summary}</li>
              ))}
            </ul>
          )}
          <Attributes
            attributes={result.finding.attributes ?? {}}
            schemaFields={schemaFields}
            spanRefCallbacks={spanRefCallbacks}
          />
        </>
      )}
      {result.result === "noEvent" && (
        <div>
          <StatusLine icon={<CircleSlash className="size-4 text-muted-foreground" />} label="No event identified" />
          <p className="mt-1 text-xs text-muted-foreground">The signal did not match this trace.</p>
        </div>
      )}
      {result.result === "failed" && (
        <div>
          <StatusLine icon={<TriangleAlert className="size-4" />} label="Run failed" className="text-destructive" />
          <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words">{result.error}</p>
        </div>
      )}
      <RunStats stats={result.stats} />
    </div>
  );
}
