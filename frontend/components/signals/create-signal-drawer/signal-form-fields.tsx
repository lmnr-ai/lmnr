"use client";

import { Info, Loader2 } from "lucide-react";
import { useCallback } from "react";
import { Controller, useFormContext } from "react-hook-form";

import templates from "@/components/signals/prompts";
import { getDefaultSchemaFields, jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, tryParseJson } from "@/lib/utils";

import SamplingSection from "./sampling-section";
import SchemaFieldsBuilder from "./schema-fields-builder";
import TemplatePicker from "./template-picker";
import TestSection from "./test-section";
import TriggersSection from "./triggers-section";
import { type ManageSignalForm } from "./types";

export default function SignalFormFields({
  showTemplates,
  isLoading,
  className,
}: {
  showTemplates: boolean;
  isLoading: boolean;
  className?: string;
}) {
  const {
    control,
    setValue,
    getValues,
    formState: { errors, isValid },
  } = useFormContext<ManageSignalForm>();

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
        </TooltipProvider>
        <Controller
          name="prompt"
          rules={{ required: "Prompt is required" }}
          control={control}
          render={({ field }) => (
            <Textarea
              className="min-h-24 max-h-48 text-sm"
              id="prompt"
              placeholder="Analyze this trace for failures, errors, or things that went wrong..."
              rows={6}
              {...field}
              value={field.value || ""}
            />
          )}
        />
        {errors.prompt && <p className="text-xs text-destructive">{errors.prompt.message}</p>}
      </div>

      <SchemaFieldsBuilder />

      <TriggersSection />

      <SamplingSection />

      <TestSection />

      <Button className="ml-auto w-fit" type="submit" size="md" disabled={isLoading || !isValid}>
        <Loader2 className={cn("hidden", isLoading && "animate-spin block")} size={16} />
        {!showTemplates ? "Save" : "Create"}
      </Button>
    </div>
  );
}
