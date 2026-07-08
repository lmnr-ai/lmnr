import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import useSWR, { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

import { type ManageTemplateForm, type Template, type TemplateScope } from "../index";
import { type ManageTemplateMode } from "../template-picker";
import { fetchRenderData } from "./fetch-render-data";
import LeftColumn from "./left-column";
import RightPanel from "./right-panel";

interface Props {
  mode: ManageTemplateMode;
  scope?: TemplateScope;
  /** Trace whose span outline enriches the copied AI prompt (trace scope only). */
  traceId?: string;
  onCancel: () => void;
  onSaved: () => void;
}

const ManageTemplateDialog = ({ mode, scope = "span", traceId, onCancel, onSaved }: Props) => {
  const { projectId } = useParams();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const { control, handleSubmit, reset, getValues, setValue } = useFormContext<ManageTemplateForm>();
  const effectiveScope = useWatch({ control, name: "scope" }) ?? scope;
  const code = useWatch({ control, name: "code" });

  const { data: spanOutline } = useSWR<unknown[]>(
    mode !== null && effectiveScope === "trace" && traceId
      ? `/api/projects/${projectId}/traces/${traceId}/span-outline`
      : null,
    swrFetcher
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [describeText, setDescribeText] = useState("");
  const [activeTab, setActiveTab] = useState("preview");

  // In-flight generate request. The dialog never unmounts, so a request that
  // resolves after the user cancels must NOT write back into the (now restored)
  // form — abort it on close and bail on `aborted`.
  const generateAbortRef = useRef<AbortController | null>(null);

  // Laminar session for grouping generations. Editing uses the template id
  // (stable across sessions); creating has no id yet, so we mint a per-open
  // draft id so a create session's iterative "Request changes" runs group.
  const draftSessionIdRef = useRef<string>("");

  // Reset transient UI state each time the dialog opens. Because the component
  // stays mounted across open/close, a stale `activeTab` (e.g. the trace-only
  // "filter" tab) would otherwise leave a span dialog's panel blank.
  useEffect(() => {
    if (mode !== null) {
      setActiveTab("preview");
      setDescribeText("");
      setIsGenerating(false);
      draftSessionIdRef.current = `render-template-draft:${crypto.randomUUID()}`;
    }
  }, [mode]);

  const handleGenerate = useCallback(async () => {
    if (!describeText.trim()) {
      toast({ variant: "destructive", title: "Describe what you want the template to render first." });
      return;
    }
    generateAbortRef.current?.abort();
    const controller = new AbortController();
    generateAbortRef.current = controller;
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/render-templates/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          scope: effectiveScope,
          description: describeText,
          // Group by template id when editing; fall back to the per-open draft id.
          sessionId: getValues("id") ?? draftSessionIdRef.current,
          currentCode: getValues("code"),
          ...(effectiveScope === "trace"
            ? {
                currentWhereClause: getValues("whereClause") ?? null,
                traceOutline: spanOutline ? JSON.stringify(spanOutline) : undefined,
              }
            : { sampleData: getValues("testData") }),
        }),
      });
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: "Error", description: errMessage ?? "Failed to generate template" });
        return;
      }
      const result = (await res.json()) as { code: string; whereClause?: string };
      // Cancelled mid-resolve — the form was already restored; don't clobber it.
      if (controller.signal.aborted) return;
      setValue("code", result.code, { shouldDirty: true });
      const nextWhereClause =
        result.whereClause !== undefined ? result.whereClause : (getValues("whereClause") ?? null);
      if (effectiveScope === "trace" && result.whereClause !== undefined) {
        setValue("whereClause", result.whereClause, { shouldDirty: true });
      }
      setDescribeText("");
      setActiveTab("preview");
      // Auto-fetch the trace's spans against the (possibly new) filter and pipe
      // them into testData so the preview renders real data immediately. Best-
      // effort: a failure leaves the prior sample data in place, preview still shows.
      if (effectiveScope === "trace" && traceId) {
        try {
          const renderData = await fetchRenderData(projectId as string, traceId, nextWhereClause, controller.signal);
          if (controller.signal.aborted) return;
          setValue("testData", JSON.stringify(renderData, null, 2), { shouldDirty: false });
        } catch {
          // Non-fatal — generation succeeded; the data fetch just didn't refresh.
        }
      }
    } catch (e) {
      // Aborted by cancel — silent, whoever cancelled owns the next state.
      if (controller.signal.aborted) return;
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to generate template",
      });
    } finally {
      // Only the current request may clear the flag/ref — a newer one owns them.
      if (generateAbortRef.current === controller) {
        generateAbortRef.current = null;
        setIsGenerating(false);
      }
    }
  }, [projectId, effectiveScope, traceId, describeText, getValues, setValue, spanOutline, toast]);

  // Abort any in-flight generate before delegating to the parent's cancel — used
  // by both close affordances (overlay/escape and the panel's X button).
  const handleCancel = useCallback(() => {
    generateAbortRef.current?.abort();
    onCancel();
  }, [onCancel]);

  const submit = useCallback(
    async (data: ManageTemplateForm) => {
      const isUpdate = !!data.id;
      const dataScope = data.scope ?? scope;
      const baseUrl = `/api/projects/${projectId}/render-templates`;
      try {
        setIsSaving(true);
        const res = await fetch(isUpdate ? `${baseUrl}/${data.id}` : baseUrl, {
          method: isUpdate ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            code: data.code,
            ...(!isUpdate && { type: dataScope }),
            ...(dataScope === "trace" && { whereClause: data.whereClause ?? null }),
          }),
        });

        if (!res.ok) {
          const errMessage = await res
            .json()
            .then((d) => d?.error)
            .catch(() => null);
          toast({
            variant: "destructive",
            title: "Error",
            description: errMessage ?? `Failed to ${isUpdate ? "update" : "create"} the template`,
          });
          return;
        }

        // Preserve testData — the API response only carries {id, name, code, ...}.
        const result = (await res.json()) as Template;
        await mutate((key) => typeof key === "string" && key.startsWith(baseUrl));
        reset({ ...result, scope: dataScope, testData: data.testData });
        toast({ title: `Template ${isUpdate ? "updated" : "created"}` });
        onSaved();
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : `Failed to ${isUpdate ? "update" : "create"} the template`,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, mutate, toast, reset, onSaved, scope]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) handleCancel();
    },
    [handleCancel]
  );

  const title = `${mode === "edit" ? "Edit" : "Create a"} custom render template`;

  return (
    <Dialog open={mode !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex h-[85vh] max-h-[900px] w-[90vw] max-w-[1400px] flex-col overflow-hidden rounded-lg border p-0 outline-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogDescription className="sr-only">
          Generate or write custom JSX to render your data however you want.
        </DialogDescription>

        <form onSubmit={handleSubmit(submit)} className="flex h-full w-full flex-col overflow-hidden">
          <div className="flex h-14 shrink-0 items-center justify-between border-b px-5">
            <DialogTitle className="text-base font-normal text-foreground">{title}</DialogTitle>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="md" onClick={handleCancel} className="rounded px-4 text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                size="md"
                disabled={isSaving || isGenerating || !code?.trim()}
                className="gap-1.5 rounded px-4 text-xs"
              >
                {isSaving && <Loader2 className="size-3.5 animate-spin" />}
                Save
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <LeftColumn
              isGenerating={isGenerating}
              describeText={describeText}
              onDescribeChange={setDescribeText}
              onGenerate={handleGenerate}
            />
            <RightPanel
              scope={effectiveScope}
              traceId={traceId}
              spanOutline={spanOutline}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ManageTemplateDialog;
