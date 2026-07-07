import { ArrowUp, Loader2, Play, Sparkles, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useSWRConfig } from "swr";

import SQLEditor from "@/components/sql/sql-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/lib/hooks/use-toast";

import { type ManageTemplateForm, type Template, type TemplateScope } from "../index";
import JsxRenderer from "../jsx-renderer";
import { type ManageTemplateMode } from "../template-picker";
import CodeEditor from "./code-editor";
import DataPanel from "./data-panel";

interface Props {
  mode: ManageTemplateMode;
  scope?: TemplateScope;
  /** Trace whose span outline enriches the AI generation context (trace scope only). */
  traceId?: string;
  onCancel: () => void;
  onSaved: () => void;
}

interface GenerationMessage {
  role: "user" | "assistant";
  content: string;
}

const ManageTemplateDialog = ({ mode, scope = "span", traceId, onCancel, onSaved }: Props) => {
  const { projectId } = useParams();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

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

  const [aiInput, setAiInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  // Session-scoped chat history sent with every generation request. Only the
  // latest user message is typed by the user; the rest rides along behind the
  // single input so follow-ups ("make the headers smaller") work.
  const [aiHistory, setAiHistory] = useState<GenerationMessage[]>([]);
  const generationAbortRef = useRef<AbortController | null>(null);

  // The dialog stays mounted across open/close — drop the previous session's
  // state and abort any in-flight generation so a late response can't write
  // into the form after cancelManage has reset it.
  useEffect(() => {
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setTestResult(null);
    setAiInput("");
    setAiHistory([]);
  }, [mode]);

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

  const generateTemplate = useCallback(async () => {
    const prompt = aiInput.trim();
    if (!prompt || isGenerating) return;

    const dataScope = getValues("scope") ?? scope;
    const messages: GenerationMessage[] = [...aiHistory, { role: "user", content: prompt }];

    const abortController = new AbortController();
    generationAbortRef.current = abortController;

    setAiInput("");
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/render-templates/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          scope: dataScope,
          messages,
          currentCode: getValues("code"),
          ...(dataScope === "trace" && { currentWhereClause: getValues("whereClause") ?? null, traceId }),
          ...(dataScope === "span" && { testData: getValues("testData") }),
        }),
      });
      const data = await res.json().catch(() => null);
      if (abortController.signal.aborted) return;

      if (!res.ok || !data?.code) {
        const errMessage = data?.error ?? "Failed to generate the template";
        // Keep the refusal in history so follow-ups have context.
        setAiHistory([...messages, { role: "assistant", content: `Request refused: ${errMessage}` }]);
        toast({ variant: "destructive", title: "Generation failed", description: errMessage });
        return;
      }

      setValue("code", data.code, { shouldDirty: true });
      let appliedFilter = false;
      if (dataScope === "trace" && typeof data.whereClause === "string") {
        appliedFilter = data.whereClause !== (getValues("whereClause") ?? "");
        setValue("whereClause", data.whereClause, { shouldDirty: true });
      }
      // The full template rides in the system prompt's <current_template> on the
      // next turn — a short marker here keeps history tokens flat.
      setAiHistory([...messages, { role: "assistant", content: "Done — updated the template code in the editor." }]);
      // Refresh the preview data when the generated filter changed the span selection.
      if (appliedFilter && traceId) void testWhereClause();
    } catch (e) {
      // Aborted because the dialog closed — the session state is already reset.
      if (abortController.signal.aborted) return;
      // Transient failure — restore the input so the user can retry without retyping.
      setAiInput(prompt);
      toast({
        variant: "destructive",
        title: "Generation failed",
        description: e instanceof Error ? e.message : "Failed to generate the template",
      });
    } finally {
      if (generationAbortRef.current === abortController) generationAbortRef.current = null;
      setIsGenerating(false);
    }
  }, [aiInput, isGenerating, aiHistory, projectId, scope, traceId, getValues, setValue, toast, testWhereClause]);

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
              Write JSX that renders your data, or describe it and let AI generate the template.
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

          <div className="grid flex-1 grid-cols-[minmax(360px,1fr)_minmax(0,1.4fr)] gap-4 overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-col gap-3 pl-4 py-4">
              <div>
                <Label htmlFor="template-name" className="text-xs tracking-wide text-muted-foreground">
                  Name
                </Label>
                <Controller
                  rules={{ required: "Template name is required" }}
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="template-name"
                      className="mt-1 h-8 w-full"
                      placeholder="e.g. Trace summary card"
                      autoFocus
                      {...field}
                    />
                  )}
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
              </div>

              {effectiveScope === "trace" && (
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
                            editable={!isGenerating}
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
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  {isGenerating ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Sparkles className="size-3.5 shrink-0 text-primary" />
                  )}
                  <Input
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void generateTemplate();
                      }
                    }}
                    placeholder={
                      isGenerating
                        ? "Generating template…"
                        : aiHistory.length > 0
                          ? "Ask for changes, e.g. make the headers smaller"
                          : effectiveScope === "trace"
                            ? "Describe what to render, e.g. LLM spans as a chat conversation"
                            : "Describe what to render, e.g. the messages array as a chat"
                    }
                    disabled={isGenerating}
                    className="h-7 flex-1 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondaryLight"
                    className="size-6 shrink-0 rounded-full"
                    disabled={isGenerating || !aiInput.trim()}
                    onClick={generateTemplate}
                    title="Generate with AI"
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                </div>
                <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                  {/* Read-only while generating: the request carries a snapshot of the
                      code, so edits made mid-flight would be silently replaced. */}
                  <CodeEditor readOnly={isGenerating} />
                  {isGenerating && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                      <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin text-primary" />
                        Generating template…
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-col pr-4 py-4">
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
          </div>

          <DialogFooter className="border-t px-5 py-3">
            <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {mode === "edit" ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ManageTemplateDialog;
