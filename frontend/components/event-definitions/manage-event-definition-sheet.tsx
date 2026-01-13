"use client";

import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import Ajv from "ajv";
import { get } from "lodash";
import { BookMarked, ChevronRight, Loader2, PlayIcon, X } from "lucide-react";
import { useParams } from "next/navigation";
import React, { PropsWithChildren, useCallback, useState } from "react";
import {
  Control,
  Controller,
  FieldErrors,
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  UseFormGetValues,
  UseFormWatch,
} from "react-hook-form";

import templates from "@/components/event-definitions/prompts";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { theme } from "@/components/ui/content-renderer/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select.tsx";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { SemanticEventDefinition } from "@/lib/actions/semantic-event-definitions";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, tryParseJson } from "@/lib/utils";

export type ManageEventDefinitionForm = Omit<
  SemanticEventDefinition,
  "isSemantic" | "createdAt" | "id" | "structuredOutput" | "triggerSpans"
> & {
  id?: string;
  structuredOutput: string;
  triggerSpans: { name: string }[];
  testTraceId?: string;
};

const ajv = new Ajv({
  validateFormats: false,
});

export const getDefaultValues = (projectId: string): ManageEventDefinitionForm => ({
  name: "",
  prompt: "",
  structuredOutput:
    "{\n" + '  "type": "object",\n' + '  "properties": {\n' + "  },\n" + '   "required": [\n' + "  ]\n" + "}",
  projectId,
  triggerSpans: [],
  testTraceId: "",
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
              <p className="text-destructive text-xs mt-1">{errors.triggerSpans?.[index]?.name?.message}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const TestEventDefinitionField = ({
  control,
  watch,
  getValues,
  projectId,
}: {
  control: Control<ManageEventDefinitionForm, any, ManageEventDefinitionForm>;
  watch: UseFormWatch<ManageEventDefinitionForm>;
  getValues: UseFormGetValues<ManageEventDefinitionForm>;
  projectId: string;
}) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [testOutput, setTestOutput] = useState("");

  const testSemanticEvent = useCallback(async () => {
    const name = getValues("name");
    const prompt = getValues("prompt");
    const structuredOutput = getValues("structuredOutput");
    const triggerSpans = getValues("triggerSpans");
    const testTraceId = getValues("testTraceId");

    if (!name || !prompt || !structuredOutput || !testTraceId?.trim()) return;

    setIsExecuting(true);
    setTestOutput("");

    try {
      const executeRes = await fetch(`/api/projects/${projectId}/semantic-event-definitions/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          traceId: testTraceId,
          eventDefinition: {
            name,
            prompt,
            structured_output_schema: tryParseJson(structuredOutput),
            trigger_spans: triggerSpans.map((ts) => ts.name).filter((name) => name.trim().length > 0),
          },
        }),
      });

      const result = await executeRes.json();

      if (!executeRes.ok) {
        setTestOutput(`Error: ${result.error || "Failed to execute semantic event"}`);
      } else {
        setTestOutput(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      setTestOutput(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsExecuting(false);
    }
  }, [getValues, projectId]);

  return (
    <Collapsible defaultOpen={false} className="group overflow-hidden">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="justify-start items-start gap-2 w-full bg-muted/50 group-data-[state=open]:rounded-b-none h-auto"
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 group-data-[state=open]:rotate-90 transition-transform duration-200" />
          <div className="flex flex-col items-start gap-1">
            <Label className="cursor-pointer">Test Event Definition</Label>
            <span className="text-xs text-muted-foreground font-normal">
              Test this semantic event definition against an existing trace
            </span>
          </div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 px-4 pt-2 pb-4 bg-muted/50 rounded-b-md">
        <div className="flex flex-col gap-1">
          <Label htmlFor="testTraceId" className="text-sm">
            Trace ID
          </Label>
          <p className="text-xs text-muted-foreground">
            Enter a valid trace ID from your project to test the event definition.
          </p>
          <Controller
            name="testTraceId"
            control={control}
            render={({ field }) => (
              <Input
                id="testTraceId"
                placeholder="00000000-0000-0000-0000-000000000000"
                className="font-mono text-sm"
                {...field}
                value={field.value || ""}
              />
            )}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={testSemanticEvent}
          disabled={
            !watch("name") ||
            !watch("prompt") ||
            !watch("structuredOutput")?.trim() ||
            !watch("testTraceId")?.trim() ||
            isExecuting
          }
          className="w-fit"
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              Testing...
            </>
          ) : (
            <>
              <PlayIcon className="w-3.5 h-3.5 mr-1" />
              Test
            </>
          )}
        </Button>

        {isExecuting && (
          <span className="text-sm text-muted-foreground shimmer">
            Testing semantic event... This may take a minute
          </span>
        )}

        {testOutput && !isExecuting && (
          <div className="flex flex-col gap-2 overflow-hidden">
            <Label className="text-sm">Test Result</Label>
            <div className="border rounded-md bg-muted/50 overflow-auto min-h-32 max-h-96">
              <CodeMirror
                height="100%"
                className="h-full"
                placeholder="Enter structured output for this event..."
                readOnly
                value={testOutput}
                extensions={[json(), EditorView.lineWrapping]}
                theme={theme}
              />
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
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
    [setValue]
  );

  const submit = useCallback(
    async (data: ManageEventDefinitionForm) => {
      try {
        setIsLoading(true);

        const eventDefinition = {
          name: data.name,
          prompt: data.prompt,
          structuredOutput: tryParseJson(data.structuredOutput),
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

  const validateJsonSchema = useCallback((value?: string) => {
    if (!value) {
      return "Structured output is required.";
    }

    try {
      const parsed = JSON.parse(value);

      try {
        ajv.compile(parsed);
        return true;
      } catch (schemaError) {
        return `Invalid JSON Schema: ${schemaError instanceof Error ? schemaError.message : "Schema validation failed"}`;
      }
    } catch (e) {
      return "Invalid JSON structure";
    }
  }, []);

  return (
    <>
      <SheetHeader className="pt-4 px-4">
        <SheetTitle>{id ? getValues("name") : "Create new semantic event"}</SheetTitle>
      </SheetHeader>
      <ScrollArea className="flex-1">
        <form onSubmit={handleSubmit(submit)} className="grid gap-4 p-4">
          {!id && (
            <Select onValueChange={(value) => applyTemplate(Number(value))}>
              <SelectTrigger>
                <div className="flex items-center">
                  <BookMarked className="w-4 h-4 mr-1.5" />
                  <span className="text-sm font-medium">Start from a template</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                {templates.map((template, index) => (
                  <SelectItem key={template.name} value={String(index)}>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium">{template.name}</p>
                      <p className="text-xs text-muted-foreground">{template.description}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              rules={{ required: "Prompt is required" }}
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
                validate: validateJsonSchema,
              }}
              render={({ field }) => (
                <div
                  className={cn("border rounded-md bg-muted/50 overflow-hidden min-h-32 max-h-64", {
                    "border border-destructive/75": errors.structuredOutput?.message,
                  })}
                >
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
            {errors.structuredOutput && <p className="text-xs text-destructive">{errors.structuredOutput.message}</p>}
          </div>
          <TriggerSpansField control={control} errors={errors} />

          <TestEventDefinitionField
            control={control}
            watch={watch}
            getValues={getValues}
            projectId={String(projectId)}
          />

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
    mode: "onChange",
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
