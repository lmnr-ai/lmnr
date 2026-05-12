import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { DialogTrigger } from "@radix-ui/react-dialog";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { Loader2, Sparkles } from "lucide-react";
import { useParams } from "next/navigation";
import React, { type PropsWithChildren, useCallback, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { theme } from "@/components/ui/content-renderer/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { type ManageTemplateForm, type Template } from "./index";
import JsxRenderer from "./jsx-renderer";

const ManageTemplateDialog = ({
  open,
  onOpenChange,
  children,
}: PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const aiInputRef = useRef<HTMLTextAreaElement>(null);
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

  const submit = useCallback(
    async (data: ManageTemplateForm) => {
      try {
        setIsLoading(true);

        const templateData = {
          name: data.name,
          code: data.code,
        };

        const isUpdate = !!data.id;
        const url = isUpdate
          ? `/api/projects/${projectId}/render-templates/${data.id}`
          : `/api/projects/${projectId}/render-templates`;
        const method = isUpdate ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(templateData),
        });

        if (!res.ok) {
          const errorText = await res.text();
          toast({
            variant: "destructive",
            title: "Error",
            description: errorText || `Failed to ${isUpdate ? "update" : "create"} the template`,
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
        setIsLoading(false);
      }
    },
    [projectId, mutate, toast, onOpenChange, reset]
  );

  const handleAiGenerate = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || !projectId) return;

    setIsAiDialogOpen(false);
    setAiPrompt("");
    setIsAiLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/render-templates/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          currentCode: getValues("code") || undefined,
          testData: getValues("testData") || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Generation failed",
          description: data?.error || "Failed to generate template",
        });
        return;
      }

      if (data.code) {
        setValue("code", data.code, { shouldDirty: true });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Generation failed",
        description: e instanceof Error ? e.message : "Unexpected error",
      });
    } finally {
      setIsAiLoading(false);
    }
  }, [aiPrompt, projectId, getValues, setValue, toast]);

  const handleAiKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleAiGenerate();
      }
    },
    [handleAiGenerate]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-[92vw] max-h-[92vh] w-[92vw] h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="border-b px-5 py-3 space-y-0.5">
          <DialogTitle className="text-base">{id ? name || "Edit template" : "New render template"}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {id
              ? "Edit this JSX template to customize how data is rendered."
              : "Define a JSX template to customize how JSON data is rendered."}
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex gap-4 p-4 flex-1 overflow-hidden">
            <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Preview</Label>
              </div>
              <div className="flex-1 min-h-0 border rounded-md overflow-hidden bg-muted/30">
                <JsxRenderer code={watch("code")} data={watch("testData")} />
              </div>
            </div>
            <div className="flex flex-col flex-1 min-w-0 min-h-0">
              <div className="mb-3">
                <Label htmlFor="template-name" className="text-xs text-muted-foreground">
                  Name
                </Label>
                <Controller
                  rules={{ required: "Template name is required" }}
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="template-name"
                      className="w-full mt-1 h-8"
                      placeholder="e.g. Trace summary card"
                      autoFocus
                      {...field}
                    />
                  )}
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
              </div>
              <Tabs className="flex flex-col flex-1 min-h-0" defaultValue="editor">
                <div className="flex items-center justify-between gap-2">
                  <TabsList>
                    <TabsTrigger value="editor">Template</TabsTrigger>
                    <TabsTrigger value="data">Test Data</TabsTrigger>
                  </TabsList>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5"
                    disabled={isAiLoading}
                    onClick={() => {
                      setIsAiDialogOpen(true);
                      setTimeout(() => aiInputRef.current?.focus(), 0);
                    }}
                  >
                    {isAiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    Ask AI
                  </Button>
                </div>
                <TabsContent value="editor" className="flex-1 min-h-0 pt-2 mt-0">
                  <div className="border rounded-md bg-muted/30 h-full overflow-hidden">
                    <Controller
                      name="code"
                      control={control}
                      render={({ field }) => (
                        <CodeMirror
                          value={field.value}
                          onChange={field.onChange}
                          extensions={[javascript({ jsx: true })]}
                          theme={theme}
                          height="100%"
                          className="h-full text-xs"
                        />
                      )}
                    />
                  </div>
                  {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code.message}</p>}
                </TabsContent>
                <TabsContent value="data" className="flex-1 min-h-0 pt-2 mt-0">
                  <div className="border rounded-md bg-muted/30 h-full overflow-hidden">
                    <Controller
                      name="testData"
                      control={control}
                      render={({ field }) => (
                        <CodeMirror
                          value={field.value}
                          onChange={field.onChange}
                          extensions={[json(), EditorView.lineWrapping]}
                          theme={theme}
                          height="100%"
                          className="h-full text-xs"
                          placeholder='{"example": "data"}'
                        />
                      )}
                    />
                  </div>
                  {errors.testData && <p className="text-xs text-red-500 mt-1">{errors.testData.message}</p>}
                </TabsContent>
              </Tabs>
            </div>
          </div>
          <DialogFooter className="border-t px-5 py-3 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              <Loader2 className={cn("mr-2 hidden size-4", isLoading ? "animate-spin block" : "")} />
              {id ? "Save" : "Create template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex gap-2 items-center">
              <Sparkles className="size-4 shrink-0" />
              Generate template with AI
            </DialogTitle>
            {watch("code") && (
              <p className="text-xs text-muted-foreground">AI has context of your current template and test data.</p>
            )}
          </DialogHeader>
          <Textarea
            ref={aiInputRef}
            placeholder="e.g. Render a card showing status, latency and cost with a status badge."
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={handleAiKeyDown}
            autoFocus
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAiGenerate} disabled={!aiPrompt.trim()}>
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default ManageTemplateDialog;
