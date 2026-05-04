"use client";

import { ChevronDown, ChevronUp, Copy, Info, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import templates from "@/components/signals/prompts";
import { getDefaultSchemaFields, jsonSchemaToSchemaFields, schemaFieldsToJsonSchema } from "@/components/signals/utils";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, tryParseJson } from "@/lib/utils";

import { type ManageSignalContentVariant } from "./manage-signal-content";
import SamplingSection from "./sampling-section";
import SchemaFieldsBuilder from "./schema-fields-builder";
import TemplatePicker from "./template-picker";
import TriggersSection from "./triggers-section";
import { type ManageSignalForm } from "./types";

export default function SignalFormFields({
  variant,
  showTemplates,
  isLoading,
  className,
}: {
  variant: ManageSignalContentVariant;
  showTemplates: boolean;
  isLoading: boolean;
  className?: string;
}) {
  const {
    control,
    setValue,
    getValues,
    formState: { errors, isValid, isDirty },
  } = useFormContext<ManageSignalForm>();
  const { toast } = useToast();
  const [promptExpanded, setPromptExpanded] = useState(false);

  const schemaFields = useWatch({ control, name: "schemaFields" });

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

  const clearToBlank = useCallback(() => {
    setValue("prompt", "", { shouldValidate: true });
    setValue("schemaFields", getDefaultSchemaFields(), { shouldValidate: true });
  }, [setValue]);

  const handleCopyPrompt = useCallback(async () => {
    const prompt = getValues("prompt") || "";
    try {
      await navigator.clipboard.writeText(prompt);
      toast({ title: "Copied prompt", duration: 1000 });
    } catch {
      toast({ variant: "destructive", title: "Failed to copy prompt" });
    }
  }, [getValues, toast]);

  const handleCopySchema = useCallback(async () => {
    const fields = getValues("schemaFields") || [];
    const schema = schemaFieldsToJsonSchema(fields);
    try {
      await navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
      toast({ title: "Copied JSON schema", duration: 1000 });
    } catch {
      toast({ variant: "destructive", title: "Failed to copy JSON schema" });
    }
  }, [getValues, toast]);

  const canCopySchema = (schemaFields ?? []).some((f) => f.name.trim());
  const isEditing = !showTemplates;

  return (
    <div
      className={cn(
        "grid gap-8 py-4",
        {
          "pb-16": !showTemplates,
        },
        className
      )}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="name" className="text-sm font-medium">
          Name
        </Label>
        <Controller
          rules={{ required: "Name is required" }}
          name="name"
          control={control}
          render={({ field }) => (
            <Input
              disabled={Boolean(getValues("id"))}
              id="name"
              placeholder="Signal name"
              autoFocus
              size="sm"
              {...field}
            />
          )}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      {showTemplates && <TemplatePicker onApply={applyTemplate} onClear={clearToBlank} />}
      <div className="grid gap-1.5">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="prompt" className="text-sm font-medium">
                Prompt
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-60">
                  <p>Describe what you&apos;re looking for in the trace.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            {isEditing && (
              <Button type="button" variant="outline" size="sm" onClick={handleCopyPrompt}>
                <Copy className="size-3 mr-1" />
                Copy prompt
              </Button>
            )}
          </div>
        </TooltipProvider>
        <div className="relative">
          <Controller
            name="prompt"
            rules={{ required: "Prompt is required" }}
            control={control}
            render={({ field }) => (
              <Textarea
                className={cn("min-h-24 text-sm pb-6", promptExpanded ? "max-h-none" : "max-h-48")}
                id="prompt"
                placeholder="Analyze this trace for failures, errors, or things that went wrong..."
                rows={6}
                {...field}
                value={field.value || ""}
              />
            )}
          />
          <button
            type="button"
            aria-label={promptExpanded ? "Collapse prompt" : "Expand prompt"}
            onClick={() => setPromptExpanded((v) => !v)}
            className="absolute left-1/2 -translate-x-1/2 bottom-1 flex items-center justify-center rounded-sm size-5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {promptExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>
        {errors.prompt && <p className="text-xs text-destructive">{errors.prompt.message}</p>}
      </div>
      <SchemaFieldsBuilder
        headerAction={
          isEditing ? (
            <Button type="button" variant="outline" size="sm" onClick={handleCopySchema} disabled={!canCopySchema}>
              <Copy className="size-3 mr-1" />
              Copy JSON schema
            </Button>
          ) : undefined
        }
      />
      <TriggersSection />
      <SamplingSection />
      {/*  Temporarily hide test section */}
      {/*<TestSection />*/}

      {variant === "panel" && !showTemplates && (
        <Button className="ml-auto w-fit gap-2" type="submit" size="md" disabled={isLoading || !isValid || !isDirty}>
          <Loader2 className={cn("hidden", isLoading && "animate-spin block")} size={16} />
          Save
        </Button>
      )}
    </div>
  );
}
