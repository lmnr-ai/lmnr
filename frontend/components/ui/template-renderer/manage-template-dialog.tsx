import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { DialogTrigger } from "@radix-ui/react-dialog";
import CodeMirror from "@uiw/react-codemirror";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { PropsWithChildren, useCallback, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { theme } from "@/components/ui/code-highlighter/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { ManageTemplateForm, Template } from "./index";
import JsxRenderer from "./jsx-renderer";

const ManageTemplateDialog = ({
  testData,
  open,
  onOpenChange,
  children,
}: PropsWithChildren<{
  testData: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) => {
  const [isLoading, setIsLoading] = useState(false);
  const { projectId } = useParams();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const {
    control,
    handleSubmit,
    getValues,
    watch,
    reset,
    formState: { errors },
  } = useFormContext<ManageTemplateForm>();

  const id = useWatch({
    name: "id",
    control,
  });

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
          headers: {
            "Content-Type": "application/json",
          },
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
    [projectId, mutate, toast, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-[90vw] max-h-[90vh] w-[90vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle>{id ? getValues("name") : "Create new render template"}</DialogTitle>
          <DialogDescription>
            {id ? "Edit the JSX render template" : "Create a new JSX render template to customize data visualization."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col flex-1 overflow-hidden">
          <div className="grid grid-cols-2 gap-4 p-4 flex-1 overflow-hidden">
            <div className="min-h-0">
              <JsxRenderer code={watch("code")} data={watch("testData")} />
            </div>
            <div className="min-h-0 flex flex-col">
              <div className="mb-4">
                <Label htmlFor="template-name">Name</Label>
                <Controller
                  rules={{ required: "Template name is required" }}
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="template-name"
                      className="w-full mt-1"
                      placeholder="Template name"
                      autoFocus
                      {...field}
                    />
                  )}
                />
                {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>}
              </div>
              <Tabs className="flex flex-col flex-1 min-h-0" defaultValue="data">
                <TabsList>
                  <TabsTrigger value="data">Test Data</TabsTrigger>
                  <TabsTrigger value="editor">JSX Template</TabsTrigger>
                </TabsList>
                <TabsContent value="data" className="flex-1 min-h-0 pt-2">
                  <div className="border rounded-md bg-muted/50 h-full overflow-hidden">
                    <Controller
                      name="testData"
                      control={control}
                      render={({ field }) => (
                        <CodeMirror
                          value={field.value}
                          onChange={field.onChange}
                          extensions={[json()]}
                          theme={theme}
                          height="100%"
                          className="h-full"
                          placeholder='{"example": "data"}'
                        />
                      )}
                    />
                  </div>
                  {errors.testData && <p className="text-sm text-red-500 mt-1">{errors.testData.message}</p>}
                </TabsContent>
                <TabsContent value="editor" className="flex-1 min-h-0 pt-2">
                  <div className="border rounded-md bg-muted/50 h-full overflow-hidden">
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
                          className="h-full"
                        />
                      )}
                    />
                  </div>
                  {errors.code && <p className="text-sm text-red-500 mt-1">{errors.code.message}</p>}
                </TabsContent>
              </Tabs>
            </div>
          </div>
          <DialogFooter className="border-t p-4">
            <Button type="submit" disabled={isLoading}>
              <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={16} />
              {id ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ManageTemplateDialog;
