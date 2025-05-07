import React from "react";
import { Controller, useFormContext } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  anthropicThinkingModels,
  googleThinkingModels,
  openAIThinkingModels,
  PlaygroundForm,
} from "@/lib/playground/types";

const ReasoningField = () => {
  const { watch, control } = useFormContext<PlaygroundForm>();

  if (openAIThinkingModels.includes(watch("model"))) {
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
                {["low", "medium", "high"].map((item) => (
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

  if (anthropicThinkingModels.includes(watch("model"))) {
    return (
      <div className="space-y-2">
        <Controller
          render={({ field: { value, onChange } }) => (
            <>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Thinking Tokens</span>
                <Input
                  onChange={onChange}
                  value={value ?? 1024}
                  type="number"
                  className="text-sm font-medium w-16 text-right hide-arrow px-1 py-0 h-fit"
                />
              </div>
              <Slider value={[value ?? 1024]} min={100} max={32000} step={1} onValueChange={(v) => onChange(v?.[0])} />
            </>
          )}
          name="providerOptions.anthropic.thinking.budgetTokens"
          control={control}
        />
      </div>
    );
  }

  if (googleThinkingModels.includes(watch("model"))) {
    return (
      <div className="space-y-2">
        <Controller
          render={({ field: { value, onChange } }) => (
            <>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Thinking Tokens</span>
                <Input
                  onChange={onChange}
                  value={value ?? 1024}
                  type="number"
                  className="text-sm font-medium w-16 text-right hide-arrow px-1 py-0 h-fit"
                />
              </div>
              <Slider value={[value ?? 1024]} min={100} max={32000} step={1} onValueChange={(v) => onChange(v?.[0])} />
            </>
          )}
          name="providerOptions.google.thinkingConfig.thinkingBudget"
          control={control}
        />
      </div>
    );
  }
  return null;
};

export default ReasoningField;
