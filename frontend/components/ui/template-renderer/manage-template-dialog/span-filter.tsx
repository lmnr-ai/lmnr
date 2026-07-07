import { Loader2, Play } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

import SQLEditor from "@/components/sql/sql-editor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { type ManageTemplateForm } from "../index";

interface Props {
  /** Trace whose spans the WHERE clause is tested against. */
  traceId?: string;
}

// Trace-scope span selector: a SQL WHERE fragment plus a Test button that runs it
// against the current trace and pipes the result into the form's testData.
const SpanFilter = ({ traceId }: Props) => {
  const { projectId } = useParams();
  const { control, getValues, setValue } = useFormContext<ManageTemplateForm>();

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: true; count: number; truncated: boolean } | { ok: false; error: string } | null
  >(null);

  const testWhereClause = useCallback(async () => {
    if (!traceId) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/traces/${traceId}/render-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whereClause: getValues("whereClause") ?? null }),
      });
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        setTestResult({ ok: false, error: errMessage ?? "Failed to run the filter" });
        return;
      }
      const data = await res.json();
      setValue("testData", JSON.stringify(data, null, 2), { shouldDirty: false });
      setTestResult({
        ok: true,
        count: Array.isArray(data?.spans) ? data.spans.length : 0,
        truncated: !!data?.truncated,
      });
    } catch {
      setTestResult({ ok: false, error: "Failed to run the filter" });
    } finally {
      setIsTesting(false);
    }
  }, [projectId, traceId, getValues, setValue]);

  return (
    <div>
      <Label className="text-xs tracking-wide text-muted-foreground">Span filter (SQL WHERE)</Label>
      <div className="mt-1 flex items-start gap-2">
        <div className="h-16 min-w-0 flex-1 overflow-hidden rounded-md border">
          <Controller
            name="whereClause"
            control={control}
            render={({ field }) => (
              <SQLEditor
                value={field.value ?? ""}
                onChange={field.onChange}
                placeholder="e.g. span_type = 'LLM' AND name LIKE 'agent%'"
                schema={{ tables: ["spans"] }}
              />
            )}
          />
        </div>
        {traceId && (
          <Button
            type="button"
            variant="secondary"
            className="h-8 shrink-0 text-xs"
            disabled={isTesting}
            onClick={testWhereClause}
          >
            {isTesting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Play className="mr-1.5 size-3.5" />}
            Test
          </Button>
        )}
      </div>
      {testResult &&
        (testResult.ok ? (
          <p className="mt-1 text-xs text-success">
            Matched {testResult.count} {testResult.count === 1 ? "span" : "spans"}
            {testResult.truncated ? " (truncated to 256)" : ""} — preview and data updated.
          </p>
        ) : (
          <p className="mt-1 text-xs text-destructive">{testResult.error}</p>
        ))}
      <p className="mt-1 text-xs text-muted-foreground">
        Appended to <code className="font-mono">SELECT * FROM spans WHERE trace_id = &lt;trace&gt; AND (...)</code>.
        Leave empty to include all spans.{traceId ? " Test runs it against this trace." : ""}
      </p>
    </div>
  );
};

export default SpanFilter;
