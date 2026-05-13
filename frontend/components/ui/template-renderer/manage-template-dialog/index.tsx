import { DialogTrigger } from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";
import { useParams } from "next/navigation";
import React, { type PropsWithChildren, useCallback, useEffect, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { type ManageTemplateForm, type Template } from "../index";
import JsxRenderer from "../jsx-renderer";
import AiPanel from "./ai-panel";
import CodeEditor from "./code-editor";
import DataPanel from "./data-panel";
import StreamingPreview from "./streaming-preview";
import { useTemplateChat } from "./use-stream-template";

const ManageTemplateDialog = ({
  open,
  onOpenChange,
  children,
}: PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) => {
  const [isSaving, setIsSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const { projectId } = useParams();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useFormContext<ManageTemplateForm>();

  const id = useWatch({ name: "id", control });
  const name = useWatch({ name: "name", control });

  const {
    state: aiState,
    send,
    abort,
    reset: resetAi,
  } = useTemplateChat({
    projectId,
    onTurnComplete: (code) => setValue("code", code, { shouldDirty: true }),
    onError: (message) => toast({ variant: "destructive", title: "Generation failed", description: message }),
  });

  useEffect(() => {
    if (!open) {
      setAiPrompt("");
      resetAi();
    }
  }, [open, resetAi]);

  const handleSend = useCallback(() => {
    const trimmed = aiPrompt.trim();
    if (!trimmed) return;
    send({
      prompt: trimmed,
      currentCode: getValues("code") || undefined,
      testData: getValues("testData") || undefined,
    });
    setAiPrompt("");
  }, [aiPrompt, send, getValues]);

  const submit = useCallback(
    async (data: ManageTemplateForm) => {
      try {
        setIsSaving(true);
        const isUpdate = !!data.id;
        const url = isUpdate
          ? `/api/projects/${projectId}/render-templates/${data.id}`
          : `/api/projects/${projectId}/render-templates`;
        const method = isUpdate ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
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

        const result = (await res.json()) as Template;
        await mutate(`/api/projects/${projectId}/render-templates`);
        toast({ title: `Successfully ${isUpdate ? "updated" : "created"} template` });
        onOpenChange(false);
        reset(result);
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description:
            e instanceof Error
              ? e.message
              : `Failed to ${data.id ? "update" : "create"} the template. Please try again.`,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, mutate, toast, onOpenChange, reset]
  );

  const isStreaming = aiState.status === "loading";
  const latestUserPrompt = [...aiState.messages].reverse().find((m) => m.role === "user")?.content;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className="flex h-full w-full max-h-[92vh] max-w-[92vw] lg:max-w-[80vw] flex-col gap-0 overflow-hidden p-0 outline-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="relative space-y-0.5 border-b px-5 py-3 pr-12">
          <DialogTitle className="text-base">{id ? name || "Edit template" : "New render template"}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {id
              ? "Refine the look with AI, or fine-tune the code directly."
              : "Describe the UI you want, generate it with AI, then tweak if needed."}
          </p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="grid flex-1 grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)] gap-4 overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-col pl-4 py-4">
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
                    {isStreaming ? (
                      <StreamingPreview prompt={latestUserPrompt} />
                    ) : (
                      <JsxRenderer code={watch("code")} data={watch("testData")} />
                    )}
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

              <Tabs
                defaultValue="chat"
                className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden rounded-lg border bg-card"
              >
                <TabsList className="m-2 self-start">
                  <TabsTrigger value="chat">Chat</TabsTrigger>
                  <TabsTrigger value="code">Code</TabsTrigger>
                </TabsList>
                <TabsContent value="chat" className="flex min-h-0 min-w-0 flex-col border-t outline-none">
                  <AiPanel
                    prompt={aiPrompt}
                    onPromptChange={setAiPrompt}
                    onSend={handleSend}
                    onStop={abort}
                    onClear={resetAi}
                    state={aiState}
                  />
                </TabsContent>
                <TabsContent value="code" className="flex min-h-0 min-w-0 flex-col border-t outline-none">
                  <CodeEditor />
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t px-5 py-3">
            <Button type="submit" disabled={isSaving}>
              <Loader2 className={cn("mr-2 hidden size-4", isSaving && "block animate-spin")} />
              {id ? "Save" : "Create template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ManageTemplateDialog;
