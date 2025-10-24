"use client";

import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { get } from "lodash";
import { Loader2, X } from "lucide-react";
import { useParams } from "next/navigation";
import { PropsWithChildren, useCallback, useState } from "react";
import {
  Control,
  Controller,
  FieldErrors,
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { theme } from "@/components/ui/code-highlighter/utils.ts";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EventDefinition } from "@/lib/actions/event-definitions";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, tryParseJson } from "@/lib/utils";

export type ManageEventDefinitionForm = Omit<
  EventDefinition,
  "isSemantic" | "createdAt" | "id" | "structuredOutput" | "triggerSpans"
> & {
  id?: string;
  structuredOutput: string;
  triggerSpans: { name: string }[];
};

export const getDefaultValues = (projectId: string): ManageEventDefinitionForm => ({
  name: "",
  prompt: "",
  structuredOutput: "",
  projectId,
  triggerSpans: [],
});

const TriggerSpansField = ({
  control,
  errors,
}: {
  control: Control<ManageEventDefinitionForm, any, ManageEventDefinitionForm>;
  errors: FieldErrors<ManageEventDefinitionForm>;
}) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "triggerSpans",
  });

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div>
          <Label>Trigger Spans</Label>
          <p className="text-xs text-muted-foreground mt-1">Span names that will trigger this event.</p>
        </div>
        <Button icon="plus" variant="outline" onClick={() => append({ name: "" })}>
          Add Span
        </Button>
      </div>
      <div className="space-y-2">
        {fields.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
            No trigger spans configured. Click "Add Span" to add one.
          </div>
        )}
        {fields.map((field, index) => (
          <div key={field.id}>
            <div className="flex gap-2 items-start">
              <Controller
                name={`triggerSpans.${index}.name`}
                control={control}
                rules={{ required: "Span name is required" }}
                render={({ field }) => <Input {...field} placeholder="Enter span name" className="flex-1" />}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} className="h-10 px-3">
                <X className="w-4 h-4" />
              </Button>
            </div>
            {errors.triggerSpans?.[index] && (
              <p className="text-red-500 text-xs">{errors.triggerSpans?.[index]?.name?.message}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

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
    setValue,
    formState: { errors, isValid },
  } = useFormContext<ManageEventDefinitionForm>();

  const id = watch("id");
  const structuredOutput = watch("structuredOutput");

  const submit = useCallback(
    async (data: ManageEventDefinitionForm) => {
      try {
        setIsLoading(true);

        const eventDefinition = {
          name: data.name,
          prompt: data.prompt || null,
          structuredOutput: data.structuredOutput ? tryParseJson(data.structuredOutput) : null,
          triggerSpans: data.triggerSpans.map((ts) => ts.name).filter((name) => name.trim().length > 0),
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
    <DialogContent className="max-h-[80vh] overflow-auto">
      <DialogHeader>
        <DialogTitle>{id ? watch("name") : "Create new event definition"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit(submit)} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Controller
            rules={{ required: "Name is required" }}
            name="name"
            control={control}
            render={({ field }) => (
              <Input disabled={Boolean(id)} id="name" placeholder="Event name" autoFocus {...field} />
            )}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
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
                rows={5}
                {...field}
                value={field.value || ""}
              />
            )}
          />
          {errors.prompt && <p className="text-xs text-destructive">{errors.prompt.message}</p>}
        </div>

        <TriggerSpansField control={control} errors={errors} />
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="structuredOutput">Structured Output</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Define a JSON schema for the structured output of this event.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={!!structuredOutput}
                onCheckedChange={(checked) => {
                  setValue("structuredOutput", checked ? "{}" : "", { shouldValidate: true });
                }}
              />
            </div>
          </div>
          {structuredOutput && (
            <Controller
              name="structuredOutput"
              control={control}
              rules={{
                validate: (value) => {
                  try {
                    if (!value) {
                      return true;
                    }
                    JSON.parse(value);
                    return true;
                  } catch (e) {
                    return "Invalid JSON structure";
                  }
                },
              }}
              render={({ field }) => (
                <div className="border rounded-md bg-muted/50 overflow-hidden min-h-48 max-h-96">
                  <CodeMirror
                    height="100%"
                    className="h-full"
                    placeholder="Enter structured output for this event..."
                    value={field.value}
                    onChange={field.onChange}
                    extensions={[json(), EditorView.lineWrapping]}
                    theme={theme}
                  />
                </div>
              )}
            />
          )}
          {errors.structuredOutput && <p className="text-sm text-red-500">{errors.structuredOutput.message}</p>}
        </div>
      </form>
      <DialogFooter>
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
      </DialogFooter>
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

  const convertToFormValues = useCallback(
    (values: ManageEventDefinitionForm | undefined): ManageEventDefinitionForm => {
      if (!values) {
        return getDefaultValues(String(projectId));
      }

      return values;
    },
    [projectId]
  );

  const form = useForm<ManageEventDefinitionForm>({
    defaultValues: convertToFormValues(initialValues),
  });

  const onOpenChange = useCallback(
    (open: boolean) => {
      setOpen(open);
      if (open) {
        form.reset(convertToFormValues(initialValues));
      } else {
        form.reset(getDefaultValues(String(projectId)));
      }
    },
    [form, initialValues, projectId, setOpen, convertToFormValues]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <FormProvider {...form}>
        <ManageEventDefinitionDialogContent setOpen={setOpen} onSuccess={onSuccess} />
      </FormProvider>
    </Dialog>
  );
}
