import { capitalize } from "lodash";
import React from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { useLlmProfileProvider } from "@/components/playground/llm-profiles-context";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { matchKnownModel, thinkingNamespace } from "@/lib/playground/providers";
import { anthropicProviderOptionsSettings, anthropicThinkingModels } from "@/lib/playground/providers/anthropic";
import { googleProviderOptionsSettings, googleThinkingModels } from "@/lib/playground/providers/google";
import { openAIThinkingModels } from "@/lib/playground/providers/openai";
import { type PlaygroundForm } from "@/lib/playground/types";

const ReasoningField = () => {
  const { watch, control } = useFormContext<PlaygroundForm>();

  const [llmProfileId, model] = useWatch({ control, name: ["llmProfileId", "llmModel"] });
  const namespace = thinkingNamespace(useLlmProfileProvider(llmProfileId));

  if (namespace === "openai" && matchKnownModel(openAIThinkingModels, model)) {
    return (
      <div className="flex justify-between items-center">
        <span className="text-sm">Reasoning Effort</span>
        <Controller
          render={({ field: { value, onChange } }) => (
            <Select value={value} onValueChange={onChange}>
              <SelectTrigger className="w-fit">
                <SelectValue placeholder="Select reasoning" />
              </SelectTrigger>
              <SelectContent>
                {[...((model.includes("gpt-5") && ["minimal"]) || []), "low", "medium", "high"].map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          name="providerOptions.openai.reasoningEffort"
          control={control}
        />
      </div>
    );
  }

  const anthropicModel = namespace === "anthropic" ? matchKnownModel(anthropicThinkingModels, model) : undefined;
  if (anthropicModel) {
    const config = anthropicProviderOptionsSettings[anthropicModel].thinking;

    if (config.type === "effort") {
      return (
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Effort</span>
          <Controller
            render={({ field: { value, onChange } }) => (
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="w-fit">
                  <SelectValue placeholder="Select effort" />
                </SelectTrigger>
                <SelectContent>
                  {config.levels.map((level) => (
                    <SelectItem key={level} value={level}>
                      {capitalize(level)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            name="providerOptions.anthropic.effort"
            control={control}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <Controller
          render={({ field: { value, onChange } }) => {
            const tokens = value != null ? Number(value) : config.min;
            return (
              <>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Thinking Tokens</span>
                  <Input
                    onChange={(e) => onChange(Number(e.target.value))}
                    value={tokens}
                    type="number"
                    className="text-sm font-medium w-16 text-right hide-arrow px-1 py-0 h-fit"
                  />
                </div>
                <Slider
                  value={[tokens]}
                  min={config.min}
                  max={watch("maxTokens")}
                  step={1}
                  onValueChange={(v) => onChange(v?.[0])}
                />
              </>
            );
          }}
          name="providerOptions.anthropic.thinking.budgetTokens"
          control={control}
        />

        <div className="flex justify-between items-center">
          <span className="text-sm">Thinking Type</span>

          <Controller
            render={({ field: { value, onChange } }) => (
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="w-fit">
                  <SelectValue placeholder="Reasoning type" />
                </SelectTrigger>
                <SelectContent>
                  {["enabled", "disabled"].map((item) => (
                    <SelectItem key={item} value={item}>
                      {capitalize(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            name="providerOptions.anthropic.thinking.type"
            control={control}
          />
        </div>
      </div>
    );
  }

  const googleModel = namespace === "google" ? matchKnownModel(googleThinkingModels, model) : undefined;
  if (googleModel) {
    const config = googleProviderOptionsSettings[googleModel].thinkingConfig;

    if (config.type === "level") {
      return (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Thinking Level</span>
            <Controller
              render={({ field: { value, onChange } }) => (
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger className="w-fit">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    {config.levels.map((level) => (
                      <SelectItem key={level} value={level}>
                        {capitalize(level)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              name="providerOptions.google.thinkingConfig.thinkingLevel"
              control={control}
            />
          </div>
          <Controller
            render={({ field: { onChange, value } }) => (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Include Thoughts</span>
                <Switch checked={value || undefined} onCheckedChange={onChange} />
              </div>
            )}
            name="providerOptions.google.thinkingConfig.includeThoughts"
            control={control}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <Controller
          render={({ field: { value, onChange } }) => (
            <>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Thinking Tokens</span>
                <Input
                  onChange={(e) => onChange(Number(e.target.value))}
                  value={Number(value)}
                  type="number"
                  className="text-sm font-medium w-16 text-right hide-arrow px-1 py-0 h-fit"
                />
              </div>
              <Slider
                value={[Number(value)]}
                min={config.min}
                max={config.max}
                step={1}
                onValueChange={(v) => onChange(v?.[0])}
              />
            </>
          )}
          name="providerOptions.google.thinkingConfig.thinkingBudget"
          control={control}
        />
        <Controller
          render={({ field: { onChange, value } }) => (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Include Thoughts</span>
              <Switch checked={value || undefined} onCheckedChange={onChange} />
            </div>
          )}
          name="providerOptions.google.thinkingConfig.includeThoughts"
          control={control}
        />
      </div>
    );
  }
  return null;
};

export default ReasoningField;
