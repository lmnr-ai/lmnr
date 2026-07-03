import { Loader2, Play, Sparkles, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import useSWR, { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildRenderTemplatePrompt, buildTraceRenderTemplatePrompt } from "@/lib/actions/render-template/prompts";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

import { type ManageTemplateForm, type Template, type TemplateScope } from "../index";
import JsxRenderer from "../jsx-renderer";
import { type ManageTemplateMode } from "../template-picker";
import CodeEditor from "./code-editor";
import DataPanel from "./data-panel";

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

  const { data: spanOutline } = useSWR<unknown[]>(
    mode !== null && scope === "trace" && traceId ? `/api/projects/${projectId}/traces/${traceId}/span-outline` : null,
    swrFetcher
  );

  const {
    control,
    handleSubmit,
    watch,
    reset,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<ManageTemplateForm>();

  const [isSaving, setIsSaving] = useState(false);
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

  const submit = useCallback(
    async (data: ManageTemplateForm) => {
      const isUpdate = !!data.id;
      const dataScope = data.scope ?? scope;
      // Span and trace templates live in separate tables behind separate endpoints.
      const baseUrl = `/api/projects/${projectId}/${dataScope === "trace" ? "trace-render-templates" : "render-templates"}`;
      try {
        setIsSaving(true);
        const res = await fetch(isUpdate ? `${baseUrl}/${data.id}` : baseUrl, {
          method: isUpdate ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            code: data.code,
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
        // API rows carry no scope column (separate tables) — keep the form's.
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

  const effectiveScope = watch("scope") ?? scope;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) onCancel();
    },
    [onCancel]
  );

  return (
    <Dialog open={mode !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex h-full w-full max-h-[92vh] max-w-[92vw] lg:max-w-[80vw] flex-col gap-0 overflow-hidden p-0 outline-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <form onSubmit={handleSubmit(submit)} className="flex flex-1 flex-col overflow-hidden">
          <DialogHeader className="relative space-y-0.5 border-b px-5 py-3 pr-12">
            <DialogTitle className="text-base">Render template</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Write JSX that renders your data, or copy the AI prompt for a head start.
            </p>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          </DialogHeader>

          <div className="grid flex-1 grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)] gap-4 overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-col pl-4 pb-4 pt-6">
              <Tabs
                defaultValue="preview"
                className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden rounded-lg border bg-muted/30"
              >
                <TabsList className="m-2 self-start">
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="data">Data</TabsTrigger>
                </TabsList>
                <TabsContent value="preview" className="flex min-h-0 min-w-0 flex-col border-t outline-none">
                  <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
                    <JsxRenderer code={watch("code")} data={watch("testData")} />
                  </div>
                </TabsContent>
                <TabsContent value="data" className="flex min-h-0 min-w-0 flex-col border-t outline-none">
                  <DataPanel />
                </TabsContent>
              </Tabs>
            </div>

            <div className="flex min-h-0 min-w-0 flex-col gap-3 pr-4 py-4">
              <div>
                <Label htmlFor="template-name" className="text-xs tracking-wide text-muted-foreground">
                  Name
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  <Controller
                    rules={{ required: "Template name is required" }}
                    name="name"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="template-name"
                        className="h-8 flex-1"
                        placeholder="e.g. Trace summary card"
                        autoFocus
                        {...field}
                      />
                    )}
                  />
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                    {mode === "edit" ? "Save" : "Create"}
                  </Button>
                </div>
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
              </div>

              {effectiveScope === "trace" && (
                <div>
                  <Label htmlFor="template-where-clause" className="text-xs tracking-wide text-muted-foreground">
                    Span filter (SQL WHERE)
                  </Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Controller
                      name="whereClause"
                      control={control}
                      render={({ field }) => (
                        <Input
                          id="template-where-clause"
                          className="h-8 flex-1 font-mono text-xs"
                          placeholder="e.g. span_type = 'LLM' AND name LIKE 'agent%'"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && traceId && !isTesting) {
                              e.preventDefault();
                              void testWhereClause();
                            }
                          }}
                        />
                      )}
                    />
                    {traceId && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 shrink-0 text-xs"
                        disabled={isTesting}
                        onClick={testWhereClause}
                      >
                        {isTesting ? (
                          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        ) : (
                          <Play className="mr-1.5 size-3.5" />
                        )}
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
                    Appended to{" "}
                    <code className="font-mono">SELECT * FROM spans WHERE trace_id = &lt;trace&gt; AND (...)</code>.
                    Leave empty to include all spans.{traceId ? " Test runs it against this trace." : ""}
                  </p>
                </div>
              )}

              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate">
                      Generate with your AI tool - prompt includes Laminar style guide
                      {effectiveScope === "trace"
                        ? spanOutline
                          ? " + this trace's outline"
                          : ""
                        : watch("testData")?.trim()
                          ? " + your test data"
                          : ""}
                    </span>
                  </div>
                  <CopyButton
                    type="button"
                    variant="secondaryLight"
                    text={
                      effectiveScope === "trace"
                        ? buildTraceRenderTemplatePrompt(spanOutline ? JSON.stringify(spanOutline, null, 2) : undefined)
                        : buildRenderTemplatePrompt(watch("testData"))
                    }
                    className="shrink-0 text-xs"
                    iconClassName="size-3"
                  >
                    Copy prompt
                  </CopyButton>
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                  <CodeEditor />
                </div>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ManageTemplateDialog;
