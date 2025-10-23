import { TooltipPortal } from "@radix-ui/react-tooltip";
import { SlidersHorizontal } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";

import ReasoningField from "@/components/playground/messages/reasoning-field";
import { defaultMaxTokens, defaultTemperature } from "@/components/playground/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PlaygroundForm } from "@/lib/playground/types";
import { cn } from "@/lib/utils";

interface ParamsPopoverProps {
  className?: string;
}

const ParamsPopover = ({ className }: ParamsPopoverProps) => {
  const { control, watch } = useFormContext<PlaygroundForm>();

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              disabled={!watch("model")}
              variant="outline"
              className={cn(className, "self-end size-7")}
            >
              <SlidersHorizontal className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>Model Parameters</TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <PopoverContent align="start" className="flex flex-col gap-6 w-80 p-4">
        <div className="flex flex-col gap-2">
          <Controller
            render={({ field: { value, onChange } }) => (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Max Output Tokens</span>
                  <Input
                    onChange={(e) => onChange(Number(e.target.value))}
                    value={value ?? defaultMaxTokens}
                    type="number"
                    className="text-sm font-medium w-16 text-right hide-arrow px-1 py-0 h-fit"
                  />
                </div>
                <Slider
                  value={[value ?? defaultMaxTokens]}
                  defaultValue={[defaultMaxTokens]}
                  min={50}
                  max={65536}
                  step={1}
                  onValueChange={(v) => onChange(v?.[0])}
                />
              </>
            )}
            name="maxTokens"
            control={control}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Controller
            render={({ field: { value, onChange } }) => (
              <>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Temperature</span>
                  <Input
                    onChange={(e) => onChange(Number(e.target.value))}
                    value={value ?? defaultTemperature}
                    type="number"
                    className="text-sm font-medium w-16 text-right hide-arrow px-1 py-0 h-fit"
                  />
                </div>
                <Slider
                  defaultValue={[defaultTemperature]}
                  value={[value ?? defaultTemperature]}
                  min={0}
                  max={2}
                  step={0.01}
                  onValueChange={(v) => onChange(v?.[0])}
                />
              </>
            )}
            name="temperature"
            control={control}
          />
        </div>
        <ReasoningField />
      </PopoverContent>
    </Popover>
  );
};

export default ParamsPopover;
