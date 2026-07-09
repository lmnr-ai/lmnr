import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { TemplatePickerPreview, useTemplatePicker } from "@/components/ui/template-renderer/template-picker";

/** Renders the selected trace template. Template selection lives in the trace
 *  view's main view dropdown; the `TemplatePickerProvider` is mounted in
 *  `TracePanel` (with `renderData` lifted so the manage dialog's test data is
 *  the real fetched trace payload). */
export default function CustomView({
  traceId,
  renderData,
  setRenderData,
}: {
  traceId: string;
  renderData: string;
  setRenderData: (data: string) => void;
}) {
  const { projectId } = useParams();
  const { selectedTemplate, isManaging } = useTemplatePicker();
  const selectSpanById = useTraceViewStore((s) => s.selectSpanById);

  // Outcome keyed by fetch inputs. Effects run after paint, so a keyed result
  // (rather than bare isFetching/error flags) prevents one paint from showing
  // the previous trace/template's data or error after the key changes.
  const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null);

  const templateId = selectedTemplate?.id;
  const whereClause = selectedTemplate?.whereClause ?? null;
  const fetchKey = `${traceId}:${templateId ?? ""}:${whereClause ?? ""}`;

  useEffect(() => {
    // While the manage dialog is open, whereClause tracks unsaved keystrokes —
    // don't fetch drafts. The effect re-runs on close with the final value.
    if (isManaging) return;
    if (!templateId) return;

    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/traces/${traceId}/render-data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ whereClause }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errMessage = await res
            .json()
            .then((d) => d?.error)
            .catch(() => null);
          setSettled({ key: fetchKey, error: errMessage ?? "Failed to fetch trace data" });
          return;
        }
        const data = await res.json();
        setRenderData(JSON.stringify(data));
        setSettled({ key: fetchKey, error: null });
      } catch {
        if (controller.signal.aborted) return;
        setSettled({ key: fetchKey, error: "Failed to fetch trace data" });
      }
    };
    void load();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, traceId, templateId, whereClause, isManaging]);

  const current = settled?.key === fetchKey ? settled : null;
  const isPending = !!templateId && !isManaging && !current;

  return (
    <div className="flex flex-1 flex-col min-h-0 w-full overflow-hidden">
      {isPending ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : current?.error ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-destructive">
          {current.error}
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
          <TemplatePickerPreview data={renderData} onSelectSpan={selectSpanById} />
        </div>
      )}
    </div>
  );
}
