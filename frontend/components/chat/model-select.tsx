import { find } from "lodash";
import { Check, ChevronDown } from "lucide-react";
import { ReactNode } from "react";

import { ModelState } from "@/components/chat/index";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconAnthropic, IconGemini, IconOpenAI } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface ModelSelectProps {
  disabled: boolean;
  modelState: ModelState;
  onModelStateChange: ({ model, enableThinking }: ModelState) => void;
}

const models: {
  model: string;
  description: string;
  modelProvider: string;
  label: string;
  enableThinking: boolean;
  icon: ReactNode;
}[] = [
  {
    model: "gemini-2.5-pro-preview-03-25",
    label: "Gemini 2.5 Pro",
    description: "",
    enableThinking: true,
    icon: <IconGemini className="size-3" />,
    modelProvider: "gemini",
  },
  {
    model: "claude-3-7-sonnet-20250219",
    label: "Claude 3.7 Sonnet (thinking)",
    description: "",
    enableThinking: true,
    icon: <IconAnthropic className="size-3" />,
    modelProvider: "anthropic",
  },
  {
    model: "o4-mini",
    label: "o4-mini",
    description: "",
    enableThinking: true,
    icon: <IconOpenAI className="size-3" />,
    modelProvider: "openai",
  },
  {
    model: "gemini-2.5-flash-preview-04-17",
    label: "Gemini 2.5 Flash",
    description: "",
    enableThinking: true,
    icon: <IconGemini className="size-3" />,
    modelProvider: "gemini",
  },
];

const ModelSelect = ({ modelState, onModelStateChange, disabled }: ModelSelectProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button disabled={disabled} className="bg-zinc-700" variant="ghost">
        <span className="mr-2">
          {
            find(models, {
              model: modelState.model,
              modelProvider: modelState.modelProvider,
              enableThinking: modelState.enableThinking,
            })?.icon
          }
        </span>
        <span className="flex-1 text-left truncate mr-2 py-0.5">
          {find(models, {
            model: modelState.model,
            modelProvider: modelState.modelProvider,
            enableThinking: modelState.enableThinking,
          })?.label ?? "-"}
        </span>
        <ChevronDown className="text-secondary-foreground min-w-4" size={16} />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      {models.map((model) => (
        <DropdownMenuItem
          className="py-2"
          key={model.label}
          onSelect={() =>
            onModelStateChange({
              model: model.model,
              enableThinking: model.enableThinking,
              modelProvider: model.modelProvider,
            })
          }
        >
          <span className="mr-2">{model.icon}</span>
          <div className="flex flex-col flex-1 pr-2">
            <span className="flex-1">{model.label}</span>
            <span className="flex-1 text-xs text-secondary-foreground">{model.description}</span>
          </div>
          <Check
            className={cn("invisible ml-2 text-primary", {
              visible: model.model === modelState.model && model.modelProvider === modelState.modelProvider,
            })}
            size={16}
          />
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

export default ModelSelect;
