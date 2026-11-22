"use client";

import { Info } from "lucide-react";
import { useCallback } from "react";
import { Controller, useFormContext } from "react-hook-form";

import templates from "@/components/signals/prompts";
import { getDefaultSchemaFields, jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { track } from "@/lib/posthog";
import { NEW_SIGNAL_SETTINGS, readSignalSettings, type SignalSettings } from "@/lib/signals/settings";
import { cn, tryParseJson } from "@/lib/utils";

import AdditionalSettingsSection from "./additional-settings-section";
import SaveBar from "./save-bar";
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

  const applySettings = useCallback(
    (settings: SignalSettings) => {
      for (const [key, value] of Object.entries(settings) as [keyof SignalSettings, boolean][]) {
        setValue(key, value, { shouldDirty: true });
      }
    },
    [setValue]
  );

  const applyTemplate = useCallback(
    (templateIndex: number) => {
      const template = templates[templateIndex];
      track("signals", "template_applied", { template: template.name });
      setValue("prompt", template.prompt, { shouldValidate: true });
      applySettings(readSignalSettings(template));
      const parsedSchema = tryParseJson(template.structuredOutputSchema);
      if (parsedSchema) {
        const fields = jsonSchemaToSchemaFields(parsedSchema);
        setValue("schemaFields", fields, { shouldValidate: true });
      }
    },
    [setValue, applySettings]
  );

  const clearToBlank = useCallback(() => {
    track("signals", "template_applied", { template: "Blank" });
    setValue("prompt", "", { shouldValidate: true });
    applySettings(NEW_SIGNAL_SETTINGS);
    setValue("schemaFields", getDefaultSchemaFields(), { shouldValidate: true });
  }, [setValue, applySettings]);

  return (
    <div className={cn("grid gap-8 py-4 pb-16", className)}>
      {Boolean(getValues("id")) && (
        <Controller
          name="disabled"
          control={control}
          render={({ field }) => {
            const isActive = !(field.value ?? false);
            return (
              <div
                className={cn(
                  "flex items-center justify-between gap-4 rounded-lg border px-5 py-4 transition-colors",
                  isActive ? "border-primary/40 bg-primary/5" : "border-border bg-muted/40"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
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
            <Input id="name" placeholder="Signal name" autoFocus={!getValues("id")} size="sm" {...field} />
          )}
        />
        {errors.name && <p className="text-xs text-destructive-text">{errors.name.message}</p>}
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
              <TooltipContent side="right" className="max-w-44">
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
              className="min-h-24 max-h-48 text-sm scrollbar-thin"
              id="prompt"
              placeholder="Analyze this trace for failures, errors, or things that went wrong..."
              rows={6}
              {...field}
              value={field.value || ""}
            />
          )}
        />
        {errors.prompt && <p className="text-xs text-destructive-text">{errors.prompt.message}</p>}
      </div>
      <SchemaFieldsBuilder />
      <TriggersSection />
      <AdditionalSettingsSection />
      {/*  Temporarily hide test section */}
      {/*<TestSection />*/}

      {variant === "panel" && !showTemplates && <SaveBar isDirty={isDirty} isValid={isValid} isLoading={isLoading} />}
    </div>
  );
}
