import { Loader2, Sparkles, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildRenderTemplatePrompt } from "@/lib/actions/render-template/prompts";
import { useToast } from "@/lib/hooks/use-toast";

import { type ManageTemplateForm, type Template } from "../index";
import JsxRenderer from "../jsx-renderer";
import { type ManageTemplateMode } from "../template-picker";
import CodeEditor from "./code-editor";
import DataPanel from "./data-panel";

interface Props {
  mode: ManageTemplateMode;
  onCancel: () => void;
  onSaved: () => void;
}

const ManageTemplateDialog = ({ mode, onCancel, onSaved }: Props) => {
  const { projectId } = useParams();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useFormContext<ManageTemplateForm>();

  const [isSaving, setIsSaving] = useState(false);

  const submit = useCallback(
    async (data: ManageTemplateForm) => {
      const isUpdate = !!data.id;
      try {
        setIsSaving(true);
        const url = isUpdate
          ? `/api/projects/${projectId}/render-templates/${data.id}`
          : `/api/projects/${projectId}/render-templates`;
        const res = await fetch(url, {
          method: isUpdate ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: data.name, code: data.code }),
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
        await mutate(`/api/projects/${projectId}/render-templates`);
        reset({ ...result, testData: data.testData });
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
    [projectId, mutate, toast, reset, onSaved]
  );

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

              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate">
                      Generate with your AI tool - prompt includes Laminar style guide
                      {watch("testData")?.trim() ? " + your test data" : ""}
                    </span>
                  </div>
                  <CopyButton
                    type="button"
                    variant="secondaryLight"
                    text={buildRenderTemplatePrompt(watch("testData"))}
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
