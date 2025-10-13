"use client";

import { json } from "@codemirror/lang-json";
import CodeMirror from "@uiw/react-codemirror";
import { get } from "lodash";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { PropsWithChildren, useCallback, useState } from "react";
import { Controller, FormProvider, useForm, useFormContext } from "react-hook-form";

import { EventDefinition } from "@/components/event-definitions/event-definitions-store";
import { Button } from "@/components/ui/button";
import { theme } from "@/components/ui/code-highlighter/utils.ts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

export type ManageEventDefinitionForm = Omit<
  EventDefinition,
  "isSemantic" | "createdAt" | "id" | "structuredOutput"
> & {
  id?: string;
  structuredOutput: string;
};

export const getDefaultValues = (projectId: string): ManageEventDefinitionForm => ({
  name: "",
  prompt: "",
  structuredOutput: "{}",
  projectId,
});

function ManageEventDefinitionDialogContent({
  setOpen,
  onSuccess,
}: {
  setOpen: (open: boolean) => void;
  onSuccess?: (eventDefinition: ManageEventDefinitionForm) => Promise<void>;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const { projectId } = useParams();
  const { toast } = useToast();

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isValid },
  } = useFormContext<ManageEventDefinitionForm>();

  const id = watch("id");

  const submit = useCallback(
    async (data: ManageEventDefinitionForm) => {
      try {
        setIsLoading(true);

        const eventDefinition = {
          name: data.name,
          prompt: data.prompt || null,
          structuredOutput: JSON.parse(data.structuredOutput) || null,
        };

        const isUpdate = !!data.id;
        const url = isUpdate
          ? `/api/projects/${projectId}/event-definitions/${data.id}`
          : `/api/projects/${projectId}/event-definitions`;
        const method = isUpdate ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
          body: JSON.stringify(eventDefinition),
        });

        if (!res.ok) {
          const error = (await res.json()) as { error: string };
          toast({
            variant: "destructive",
            title: "Error",
            description: get(error, "error", `Failed to ${isUpdate ? "update" : "create"} the event definition`),
          });
          return;
        }

        if (onSuccess) {
          await onSuccess(data);
        }

        toast({ title: `Successfully ${isUpdate ? "updated" : "created"} event definition` });
        setOpen(false);
        reset(getDefaultValues(String(projectId)));
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description:
            e instanceof Error
              ? e.message
              : `Failed to ${data.id ? "update" : "create"} the event definition. Please try again.`,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, toast, setOpen, reset, onSuccess]
  );

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{id ? watch("name") : "Create new event definition"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit(submit)} className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="name">
            Name <span className="text-red-500">*</span>
          </Label>
          <Controller
            rules={{ required: "Name is required" }}
            name="name"
            control={control}
            render={({ field }) => <Input disabled id="name" placeholder="Event name" autoFocus {...field} />}
          />
          {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="prompt">Prompt</Label>
          <Controller
            name="prompt"
            control={control}
            render={({ field }) => (
              <Textarea
                id="prompt"
                placeholder="Enter the prompt for this event..."
                className="min-h-[120px] resize-none"
                {...field}
                value={field.value || ""}
              />
            )}
          />
          {errors.prompt && <p className="text-sm text-red-500">{errors.prompt.message}</p>}
        </div>

        <Controller
          name="structuredOutput"
          control={control}
          render={({ field }) => (
            <div className="border rounded-md bg-muted/50 overflow-hidden">
              <CodeMirror
                placeholder=""
                value={field.value}
                onChange={field.onChange}
                extensions={[json()]}
                theme={theme}
              />
            </div>
          )}
        />

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setOpen(false);
              reset(getDefaultValues(String(projectId)));
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || !isValid} handleEnter>
            <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={16} />
            {id ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

export default function ManageEventDefinitionDialog({
  children,
  open,
  setOpen,
  defaultValues: initialValues,
  onSuccess,
}: PropsWithChildren<{
  open: boolean;
  setOpen: (open: boolean) => void;
  defaultValues?: ManageEventDefinitionForm;
  onSuccess?: (eventDefinition: ManageEventDefinitionForm) => Promise<void>;
}>) {
  const { projectId } = useParams();
  const form = useForm<ManageEventDefinitionForm>({
    defaultValues: initialValues || getDefaultValues(String(projectId)),
    mode: "onChange",
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (open) {
          form.reset(initialValues || getDefaultValues(String(projectId)));
        } else {
          form.reset(getDefaultValues(String(projectId)));
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <FormProvider {...form}>
        <ManageEventDefinitionDialogContent setOpen={setOpen} onSuccess={onSuccess} />
      </FormProvider>
    </Dialog>
  );
}
