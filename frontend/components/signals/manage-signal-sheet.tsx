"use client";

import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import Ajv from "ajv";
import { get } from "lodash";
import { BookMarked, ChevronRight, Loader2, PlayIcon, X } from "lucide-react";
import { useParams } from "next/navigation";
import { type PropsWithChildren, useCallback, useState } from "react";
import {
  type Control,
  Controller,
  type FieldErrors,
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  type UseFormGetValues,
  type UseFormWatch,
} from "react-hook-form";

import templates from "@/components/signals/prompts";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { theme } from "@/components/ui/content-renderer/utils";
import { type ColumnFilter, dataTypeOperationsMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select.tsx";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { type Filter } from "@/lib/actions/common/filters";
import { type Signal } from "@/lib/actions/signals";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, tryParseJson } from "@/lib/utils";

// Allowed filter columns based on app-server/src/db/trace.rs evaluate_single_filter
const SIGNAL_TRIGGER_COLUMNS: ColumnFilter[] = [
  // Number columns
  { name: "Input token count", key: "input_token_count", dataType: "number" },
  { name: "Output token count", key: "output_token_count", dataType: "number" },
  { name: "Total token count", key: "total_token_count", dataType: "number" },
  { name: "Input cost", key: "input_cost", dataType: "number" },
  { name: "Output cost", key: "output_cost", dataType: "number" },
  { name: "Cost", key: "cost", dataType: "number" },
  { name: "Num spans", key: "num_spans", dataType: "number" },
  { name: "Top span name", key: "top_span_name", dataType: "string" },
  { name: "Session ID", key: "session_id", dataType: "string" },
  { name: "User ID", key: "user_id", dataType: "string" },
  { name: "Tags", key: "tags", dataType: "array" },
  { name: "Span name", key: "span_name", dataType: "array" },
];

export type ManageSignalForm = Omit<Signal, "isSemantic" | "createdAt" | "id" | "structuredOutput"> & {
  id?: string;
  structuredOutput: string;
  testTraceId?: string;
};

const ajv = new Ajv({
  validateFormats: false,
});

export const getDefaultValues = (projectId: string): ManageSignalForm => ({
  name: "",
  prompt: "",
  structuredOutput:
    "{\n" +
    '  "type": "object",\n' +
    '  "properties": {\n' +
    '    "foo": {\n' +
    '      "type": "string",\n' +
    '      "description": "foo"\n' +
    "    }\n" +
    "  },\n" +
    '   "required": [\n' +
    '     "foo"\n' +
    "  ]\n" +
    "}",
  projectId,
  triggers: [],
  testTraceId: "",
});

const getDefaultFilter = (): Filter => {
  const firstColumn = SIGNAL_TRIGGER_COLUMNS[0];
  const defaultOperator = dataTypeOperationsMap[firstColumn.dataType][0].key;
  return {
    column: firstColumn.key,
    operator: defaultOperator,
    value: "",
  };
};

const TriggerFilterRow = ({
  index,
  control,
  errors,
  onRemove,
}: {
  index: number;
  control: Control<ManageSignalForm, any, ManageSignalForm>;
  errors: FieldErrors<ManageSignalForm>;
  onRemove: () => void;
}) => {
  const { watch, setValue } = useFormContext<ManageSignalForm>();
  const currentColumn = watch(`triggers.${index}.column`);

  const column = SIGNAL_TRIGGER_COLUMNS.find((c) => c.key === currentColumn);
  const dataType = column?.dataType || "string";
  const operations = dataTypeOperationsMap[dataType] || dataTypeOperationsMap.string;

  const handleColumnChange = (newColumn: string) => {
    const newColumnDef = SIGNAL_TRIGGER_COLUMNS.find((c) => c.key === newColumn);
    const newDataType = newColumnDef?.dataType || "string";
    const newOperations = dataTypeOperationsMap[newDataType];
    const defaultOperator = newOperations[0].key;

    setValue(`triggers.${index}.column`, newColumn);
    setValue(`triggers.${index}.operator`, defaultOperator);
    setValue(`triggers.${index}.value`, "");
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2 items-start">
        <Controller
          name={`triggers.${index}.column`}
          control={control}
          rules={{ required: "Column is required" }}
          render={({ field }) => (
            <Select value={field.value} onValueChange={handleColumnChange}>
              <SelectTrigger className="w-40 truncate">
                <span className="truncate">
                  {SIGNAL_TRIGGER_COLUMNS.find((c) => c.key === field.value)?.name || "Select column..."}
                </span>
              </SelectTrigger>
              <SelectContent>
                {SIGNAL_TRIGGER_COLUMNS.map((col) => (
                  <SelectItem key={col.key} value={col.key}>
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <Controller
          name={`triggers.${index}.operator`}
          control={control}
          rules={{ required: "Operator is required" }}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-24">
                <span>{operations.find((op) => op.key === field.value)?.label || field.value}</span>
              </SelectTrigger>
              <SelectContent>
                {operations.map((op) => (
                  <SelectItem key={op.key} value={op.key}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <Controller
          name={`triggers.${index}.value`}
          control={control}
          rules={{ required: "Value is required" }}
          render={({ field }) => (
            <Input
              {...field}
              type={dataType === "number" ? "number" : "text"}
              placeholder="Enter value..."
              className="flex-1"
              value={field.value as string}
            />
          )}
        />
        <Button type="button" variant="ghost" onClick={onRemove} className="py-[7px] shrink-0">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      {errors.triggers?.[index] && (
        <p className="text-destructive text-xs">
          {errors.triggers?.[index]?.column?.message ||
            errors.triggers?.[index]?.operator?.message ||
            errors.triggers?.[index]?.value?.message}
        </p>
      )}
    </div>
  );
};

const TriggerFiltersField = ({
  control,
  errors,
}: {
  control: Control<ManageSignalForm, any, ManageSignalForm>;
  errors: FieldErrors<ManageSignalForm>;
}) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "triggers",
  });

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div>
          <Label>Triggers</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Filters that will trigger this signal. All filters are combined with AND.
          </p>
        </div>
        <Button icon="plus" variant="outline" onClick={() => append(getDefaultFilter())}>
          Add Filter
        </Button>
      </div>
      <div className="space-y-2">
        {fields.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
            No triggers configured. Click "Add Filter" to add one.
          </div>
        )}
        {fields.map((field, index) => (
          <TriggerFilterRow
            key={field.id}
            index={index}
            control={control}
            errors={errors}
            onRemove={() => remove(index)}
          />
        ))}
      </div>
    </div>
  );
};

const TestSignalField = ({
  control,
  watch,
  getValues,
  projectId,
}: {
  control: Control<ManageSignalForm, any, ManageSignalForm>;
  watch: UseFormWatch<ManageSignalForm>;
  getValues: UseFormGetValues<ManageSignalForm>;
  projectId: string;
}) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [testOutput, setTestOutput] = useState("");

  const testSemanticEvent = useCallback(async () => {
    const prompt = getValues("prompt");
    const structuredOutput = getValues("structuredOutput");
    const testTraceId = getValues("testTraceId");

    if (!prompt || !structuredOutput || !testTraceId?.trim()) return;

    setIsExecuting(true);
    setTestOutput("");

    try {
      const executeRes = await fetch(`/api/projects/${projectId}/signals/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          traceId: testTraceId,
          signal: {
            prompt,
            structured_output_schema: tryParseJson(structuredOutput),
          },
        }),
      });

      const result = await executeRes.json();

      if (!executeRes.ok) {
        setTestOutput(`Error: ${result.error || "Failed to execute signal"}`);
      } else {
        setTestOutput(typeof result === "string" ? result : JSON.stringify(result, null, 2));
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
            <Label className="cursor-pointer">Test Signal</Label>
            <span className="text-xs text-muted-foreground font-normal">
              Test this signal against an existing trace
            </span>
          </div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 px-4 pt-2 pb-4 bg-muted/50 rounded-b-md">
        <div className="flex flex-col gap-1">
          <Label htmlFor="testTraceId" className="text-sm">
            Trace ID
          </Label>
          <p className="text-xs text-muted-foreground">Enter a valid trace ID from your project to test the signal.</p>
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
            !watch("prompt") || !watch("structuredOutput")?.trim() || !watch("testTraceId")?.trim() || isExecuting
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
            Testing signal... this may take some time depending on the size of the trace.
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

function ManageSignalSheetContent({
  setOpen,
  onSuccess,
}: {
  setOpen: (open: boolean) => void;
  onSuccess?: (signal: ManageSignalForm) => Promise<void>;
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
  } = useFormContext<ManageSignalForm>();

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
    async (data: ManageSignalForm) => {
      try {
        setIsLoading(true);

        const signal = {
          name: data.name,
          prompt: data.prompt,
          structuredOutput: tryParseJson(data.structuredOutput),
          triggers: data.triggers,
        };

        const isUpdate = !!data.id;
        const url = isUpdate ? `/api/projects/${projectId}/signals/${data.id}` : `/api/projects/${projectId}/signals`;
        const method = isUpdate ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
          body: JSON.stringify(signal),
        });

        if (!res.ok) {
          const error = (await res.json()) as { error: string };
          toast({
            variant: "destructive",
            title: "Error",
            description: get(error, "error", `Failed to ${isUpdate ? "update" : "create"} the signal`),
          });
          return;
        }

        if (onSuccess) {
          await onSuccess(data);
        }

        toast({ title: `Successfully ${isUpdate ? "updated" : "created"} signal` });
        setOpen(false);
        reset(getDefaultValues(String(projectId)));
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description:
            e instanceof Error ? e.message : `Failed to ${data.id ? "update" : "create"} the signal. Please try again.`,
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
        <SheetTitle>{id ? getValues("name") : "Create new signal"}</SheetTitle>
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
                <Input disabled={Boolean(id)} id="name" placeholder="Signal name" autoFocus {...field} />
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
          <TriggerFiltersField control={control} errors={errors} />

          <TestSignalField control={control} watch={watch} getValues={getValues} projectId={String(projectId)} />

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

export default function ManageSignalSheet({
  children,
  open,
  setOpen,
  defaultValues: initialValues,
  onSuccess,
}: PropsWithChildren<{
  open: boolean;
  setOpen: (open: boolean) => void;
  defaultValues?: ManageSignalForm;
  onSuccess?: (signal: ManageSignalForm) => Promise<void>;
}>) {
  const { projectId } = useParams();

  const convertToFormValues = useCallback(
    (values: ManageSignalForm | undefined): ManageSignalForm => {
      if (!values) {
        return getDefaultValues(String(projectId));
      }

      return values;
    },
    [projectId]
  );

  const form = useForm<ManageSignalForm>({
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
          <ManageSignalSheetContent setOpen={setOpen} onSuccess={onSuccess} />
        </FormProvider>
      </SheetContent>
    </Sheet>
  );
}
