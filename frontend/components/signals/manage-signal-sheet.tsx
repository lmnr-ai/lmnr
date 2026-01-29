"use client";

import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { get } from "lodash";
import { BookMarked, ChevronRight, Loader2, PlayIcon, X } from "lucide-react";
import { useParams } from "next/navigation";
import { type PropsWithChildren, useCallback, useState } from "react";
import {
  type Control,
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  type UseFormGetValues,
  type UseFormWatch,
} from "react-hook-form";

import templates from "@/components/signals/prompts";
import {
  getDefaultSchemaFields,
  jsonSchemaToSchemaFields,
  SCHEMA_FIELD_TYPES,
  type SchemaField,
  schemaFieldsToJsonSchema,
} from "@/components/signals/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { theme } from "@/components/ui/content-renderer/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { type Signal } from "@/lib/actions/signals";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, tryParseJson } from "@/lib/utils";

export type ManageSignalForm = Omit<Signal, "isSemantic" | "createdAt" | "id" | "structuredOutput"> & {
  id?: string;
  schemaFields: SchemaField[];
  testTraceId?: string;
};

export const getDefaultValues = (projectId: string): ManageSignalForm => ({
  name: "",
  prompt: "",
  schemaFields: getDefaultSchemaFields(),
  projectId,
  testTraceId: "",
});

function SchemaFieldRow({ index, onRemove, canRemove }: { index: number; onRemove: () => void; canRemove: boolean }) {
  const {
    control,
    formState: { errors },
  } = useFormContext<ManageSignalForm>();

  const fieldErrors = errors.schemaFields?.[index];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2 items-start">
        <Controller
          name={`schemaFields.${index}.name`}
          control={control}
          rules={{
            required: "Name is required",
            pattern: {
              value: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
              message: "Name must be a valid identifier",
            },
          }}
          render={({ field }) => <Input {...field} placeholder="Field name" className="w-32 font-mono text-sm" />}
        />
        <Controller
          name={`schemaFields.${index}.type`}
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEMA_FIELD_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <Controller
          name={`schemaFields.${index}.description`}
          control={control}
          render={({ field }) => (
            <Textarea {...field} placeholder="Description" rows={0} className="flex-1 text-xs! py-1.25 min-h-7!" />
          )}
        />
        <Button type="button" variant="ghost" onClick={onRemove} disabled={!canRemove} className="py-[7px] shrink-0">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      {fieldErrors && (
        <p className="text-destructive text-xs">
          {fieldErrors.name?.message || fieldErrors.description?.message || fieldErrors.type?.message}
        </p>
      )}
    </div>
  );
}

function SchemaFieldsBuilder() {
  const { control } = useFormContext<ManageSignalForm>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "schemaFields",
  });

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div>
          <Label>Structured Output</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Define the fields for the structured output of this signal.
          </p>
        </div>
        <Button
          type="button"
          icon="plus"
          variant="outline"
          onClick={() => append({ name: "", description: "", type: "string" })}
        >
          Add Field
        </Button>
      </div>
      <div className="space-y-2 border rounded-md p-3 bg-muted/30">
        <div className="flex gap-2 text-xs text-muted-foreground font-medium mb-2">
          <span className="w-32">Name</span>
          <span className="w-28">Type</span>
          <span className="flex-1">Description</span>
          <span className="w-9" />
        </div>
        {fields.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
            No fields defined. Click "Add Field" to add one.
          </div>
        )}
        {fields.map((field, index) => (
          <SchemaFieldRow key={field.id} index={index} onRemove={() => remove(index)} canRemove={fields.length > 1} />
        ))}
      </div>
    </div>
  );
}

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
    const schemaFields = getValues("schemaFields");
    const testTraceId = getValues("testTraceId");

    if (!prompt || !schemaFields?.length || !testTraceId?.trim()) return;

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
            structured_output_schema: schemaFieldsToJsonSchema(schemaFields),
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

  const schemaFields = watch("schemaFields");
  const hasValidFields = schemaFields?.some((f) => f.name.trim());

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
          disabled={!watch("prompt") || !hasValidFields || !watch("testTraceId")?.trim() || isExecuting}
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

      const parsedSchema = tryParseJson(template.structuredOutputSchema);
      if (parsedSchema) {
        const fields = jsonSchemaToSchemaFields(parsedSchema);
        setValue("schemaFields", fields, { shouldValidate: true });
      }
    },
    [setValue]
  );

  const submit = useCallback(
    async (data: ManageSignalForm) => {
      try {
        setIsLoading(true);

        const structuredOutput = schemaFieldsToJsonSchema(data.schemaFields);

        const signal = {
          name: data.name,
          prompt: data.prompt,
          structuredOutput,
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

          <SchemaFieldsBuilder />

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
