import { Check, ChevronDown, Loader2, PencilIcon, Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TemplatePickerPreview,
  TemplatePickerProvider,
  useTemplatePicker,
} from "@/components/ui/template-renderer/template-picker";
import { cn } from "@/lib/utils";

const TemplateSelector = () => {
  const { templates, selectedTemplate, selectTemplate, openCreate, openEdit } = useTemplatePicker();

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-6 gap-1 px-1.5 text-xs">
            <span className="truncate max-w-[200px]">{selectedTemplate?.name ?? "Select template"}</span>
            <ChevronDown size={14} className="shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {(templates ?? []).map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => void selectTemplate(t.id)}
              className={cn("text-xs", selectedTemplate?.id === t.id && "bg-accent")}
            >
              <span className="flex-1 truncate">{t.name}</span>
              {selectedTemplate?.id === t.id && <Check className="ml-2 size-3.5 shrink-0" />}
            </DropdownMenuItem>
          ))}
          {(templates?.length ?? 0) > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={openCreate} className="text-xs text-muted-foreground">
            <Plus className="size-3.5" />
            New template
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {selectedTemplate && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
          onClick={openEdit}
          title="Edit template"
        >
          <PencilIcon className="size-3.5" />
          Edit
        </Button>
      )}
    </div>
  );
};

const CustomViewContent = ({
  traceId,
  renderData,
  setRenderData,
}: {
  traceId: string;
  renderData: string;
  setRenderData: (data: string) => void;
}) => {
  const { projectId } = useParams();
  const { selectedTemplate, isManaging } = useTemplatePicker();

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
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <TemplateSelector />
      </div>
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
          <TemplatePickerPreview data={renderData} />
        </div>
      )}
    </div>
  );
};

export default function CustomView({ traceId }: { traceId: string }) {
  // Lifted above the provider so the manage-template dialog's test data is the
  // real fetched trace payload.
  const [renderData, setRenderData] = useState<string>("");

  return (
    <TemplatePickerProvider presetKey="trace-view" testData={renderData} scope="trace">
      <CustomViewContent traceId={traceId} renderData={renderData} setRenderData={setRenderData} />
    </TemplatePickerProvider>
  );
}
