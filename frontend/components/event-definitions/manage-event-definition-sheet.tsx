"use client";

import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { get } from "lodash";
import { BookMarked, Loader2, X } from "lucide-react";
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

import templates from "@/components/event-definitions/prompts";
import { Button } from "@/components/ui/button";
import { theme } from "@/components/ui/content-renderer/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  structuredOutput: "{\n" +
      "  \"type\": \"object\",\n" +
      "  \"properties\": {\n" +
      "  },\n" +
      "   \"required\": [\n" +
      "  ]\n" +
      "}",
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
              <Button type="button" variant="ghost" onClick={() => remove(index)} className="py-[7px]">
                <X className="w-3.5 h-3.5" />
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

function ManageEventDefinitionSheetContent({
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
    getValues,
    setValue,
    formState: { errors, isValid },
  } = useFormContext<ManageEventDefinitionForm>();

  const id = watch("id");

  const applyTemplate = useCallback(
    (templateIndex: number) => {
      const template = templates[templateIndex];
      setValue("prompt", template.prompt, { shouldValidate: true });
      setValue("structuredOutput", template.structuredOutputSchema, { shouldValidate: true });
    },
    [setValue, toast]
  );

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
          ? `/api/projects/${projectId}/semantic-event-definitions/${data.id}`
          : `/api/projects/${projectId}/semantic-event-definitions`;
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
    <>
      <SheetHeader className="pt-4 px-4">
        <SheetTitle>{id ? getValues("name") : "Create new semantic event"}</SheetTitle>
      </SheetHeader>
      <ScrollArea className="flex-1">
        <form onSubmit={handleSubmit(submit)} className="grid gap-4 p-4">
          {!id && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" className="w-fit -ml-2">
                  <BookMarked className="w-4 h-4 mr-1.5" />
                  <span className="text-sm font-medium">Start from a template</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-1" align="start">
                <div className="space-y-1">
                  {templates.map((template, index) => (
                    <PopoverClose key={template.name} asChild>
                      <button
                        type="button"
                        onClick={() => applyTemplate(index)}
                        className="w-full text-left px-2 py-1 rounded-md hover:bg-muted transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{template.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                        </div>
                      </button>
                    </PopoverClose>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

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
            <div>
              <Label htmlFor="prompt">Prompt</Label>
              <p className="text-xs text-muted-foreground mt-1">This prompt will be applied to trace data.</p>
            </div>

            <Controller
              name="prompt"
              rules={{ required: "Propmpt is required" }}
              control={control}
              render={({ field }) => (
                <Textarea
                  className="min-h-28 max-h-64"
                  id="prompt"
                  placeholder="Enter the prompt for this event..."
                  rows={10}
                  {...field}
                  value={field.value || ""}
                />
              )}
            />
            {errors.prompt && <p className="text-xs text-destructive">{errors.prompt.message}</p>}
          </div>
          <div className="grid gap-2">
            <div>
              <Label htmlFor="structuredOutput">Structured Output</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Define a JSON schema for the structured output of this event.
              </p>
            </div>
            <Controller
              name="structuredOutput"
              control={control}
              rules={{
                required: "Structured output is required.",
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
                <div className="border rounded-md bg-muted/50 overflow-hidden min-h-32 max-h-64">
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
            {errors.structuredOutput && <p className="text-sm text-red-500">{errors.structuredOutput.message}</p>}
          </div>
          <TriggerSpansField control={control} errors={errors} />
          <div className="flex justify-end pt-4 border-t">
            <Button type="submit" disabled={isLoading || !isValid} handleEnter>
              <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={16} />
              {id ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </ScrollArea>
    </>
  );
}

export default function ManageEventDefinitionSheet({
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="min-w-[50vw] w-full flex flex-col gap-0">
        <FormProvider {...form}>
          <ManageEventDefinitionSheetContent setOpen={setOpen} onSuccess={onSuccess} />
        </FormProvider>
      </SheetContent>
    </Sheet>
  );
}
