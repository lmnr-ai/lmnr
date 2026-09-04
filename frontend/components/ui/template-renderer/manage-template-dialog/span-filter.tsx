import { EditorView } from "@uiw/react-codemirror";
import { Loader2, Play } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import SQLEditor from "@/components/sql/sql-editor";
import { Button } from "@/components/ui/button";

import { type ManageTemplateForm } from "../index";
import { fetchRenderData } from "./fetch-render-data";

interface Props {
  /** Trace whose spans the WHERE clause is tested against. */
  traceId?: string;
}

// Trace-scope span selector: a SQL WHERE fragment plus a Test button that runs it
// against the current trace and pipes the result into the form's testData.
const SpanFilter = ({ traceId }: Props) => {
  const { projectId } = useParams();
  const { control, getValues, setValue } = useFormContext<ManageTemplateForm>();
  const whereClause = useWatch({ control, name: "whereClause" });

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: true; count: number; truncated: boolean } | { ok: false; error: string } | null
  >(null);

  // Drop a prior "Matched N" / error once the filter is edited — it must never
  // describe a clause the user has since changed. (Testing reads whereClause but
  // doesn't mutate it, so this won't clear the result the test just set.)
  useEffect(() => {
    setTestResult(null);
  }, [whereClause]);

  const testWhereClause = useCallback(async () => {
    if (!traceId) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const data = await fetchRenderData(projectId as string, traceId, getValues("whereClause") ?? null);
      setValue("testData", JSON.stringify(data, null, 2), { shouldDirty: false });
      setTestResult({
        ok: true,
        count: Array.isArray(data?.spans) ? data.spans.length : 0,
        truncated: !!data?.truncated,
      });
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : "Failed to run the filter" });
    } finally {
      setIsTesting(false);
    }
  }, [projectId, traceId, getValues, setValue]);

  // Reserve space below the cursor so the floating Test button never covers the
  // active line when the editor scrolls (bottom-2 + h-7 button ≈ 36px).
  const editorExtensions = useMemo(() => [EditorView.scrollMargins.of(() => ({ bottom: 44 }))], []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <p>Filter out unneeded spans from custom renderer to improve rendering performance.</p>
        <p>
          Appended to <code className="font-mono">SELECT * FROM spans WHERE trace_id = &lt;trace&gt; AND (...)</code>.
        </p>
      </div>

      <div className="relative h-32 min-w-0 overflow-hidden rounded-md border">
        <Controller
          name="whereClause"
          control={control}
          render={({ field }) => (
            <SQLEditor
              value={field.value ?? ""}
              onChange={field.onChange}
              placeholder="e.g. span_type = 'LLM' AND name LIKE 'agent%'"
              schema={{ tables: ["spans"] }}
              extraExtensions={editorExtensions}
            />
          )}
        />
        {traceId && (
          <Button
            type="button"
            variant="secondary"
            className="absolute bottom-2 right-2 z-10 shadow-md"
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
          <p className="text-xs text-success-bright">
            Matched {testResult.count} {testResult.count === 1 ? "span" : "spans"}
            {testResult.truncated ? " (truncated to 256)" : ""} — preview and data updated.
          </p>
        ) : (
          <p className="text-xs text-destructive">{testResult.error}</p>
        ))}
    </div>
  );
};

export default SpanFilter;
