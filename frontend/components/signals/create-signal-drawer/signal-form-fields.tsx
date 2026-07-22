"use client";

import { Info, Loader2 } from "lucide-react";
import { useCallback } from "react";
import { Controller, useFormContext } from "react-hook-form";

import templates from "@/components/signals/prompts";
import { getDefaultSchemaFields, jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { track } from "@/lib/posthog";
import { cn, tryParseJson } from "@/lib/utils";

import SamplingSection from "./sampling-section";
import SchemaFieldsBuilder from "./schema-fields-builder";
import TemplatePicker from "./template-picker";
import TriggersSection from "./triggers-section";
import { type ManageSignalContentVariant, type ManageSignalForm } from "./types";

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

  const applyTemplate = useCallback(
    (templateIndex: number) => {
      const template = templates[templateIndex];
      track("signals", "template_applied", { template: template.name });
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
    track("signals", "template_applied", { template: "Blank" });
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
      {Boolean(getValues("id")) && (
        <Controller
          name="disabled"
          control={control}
          render={({ field }) => {
            const isActive = !(field.value ?? false);
            return (
              <div
                className={cn(
                  "flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors",
                  isActive ? "border-primary/40 bg-primary/5" : "border-border bg-muted/40"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={cn(
                      "inline-flex size-2.5 shrink-0 rounded-full",
                      isActive ? "bg-primary" : "bg-muted-foreground/40"
                    )}
                  />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <Label htmlFor="signal-enabled" className="text-sm font-medium cursor-pointer">
                      {isActive ? "Active" : "Inactive"}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {isActive
                        ? "This signal is evaluating incoming traces."
                        : "Paused — new traces aren't evaluated. Existing events and clusters are kept."}
                    </p>
                  </div>
                </div>
                <Switch
                  id="signal-enabled"
                  checked={isActive}
                  onCheckedChange={(checked) => field.onChange(!checked)}
                />
              </div>
            );
          }}
        />
      )}
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
        <TooltipProvider delay={200}>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="prompt" className="text-sm font-medium">
              Prompt
            </Label>
            <Tooltip>
              <TooltipTrigger render={<Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />} />
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
