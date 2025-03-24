import { find } from "lodash";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ModelSelectProps {
  disabled: boolean;
  modelState: { model: string; enableThinking: boolean };
  onModelStateChange: ({ model, enableThinking }: { model: string; enableThinking: boolean }) => void;
}

const models: { model: string; description: string; label: string; enableThinking: boolean }[] = [
  {
    model: "claude-3-7-sonnet-20250219",
    label: "Claude 3.7 Sonnet",
    description: "Fast",
    enableThinking: false,
  },
  {
    model: "claude-3-7-sonnet-20250219",
    label: "Claude 3.7 Sonnet (thinking)",
    description: "Slower but more reliable",
    enableThinking: true,
  },
];

const ModelSelect = ({ modelState, onModelStateChange, disabled }: ModelSelectProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button disabled={disabled} className="bg-zinc-700" variant="ghost">
        <span className="flex-1 text-left truncate mr-2 py-0.5">
          {find(models, { model: modelState.model, enableThinking: modelState.enableThinking })?.label ?? "-"}
        </span>
        <ChevronDown className="text-secondary-foreground min-w-4" size={16} />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      {models.map((model) => (
        <DropdownMenuItem
          className="py-2"
          key={model.label}
          onSelect={() => onModelStateChange({ model: model.model, enableThinking: model.enableThinking })}
        >
          <div className="flex flex-col flex-1 pr-2">
            <span className="flex-1">{model.label}</span>
            <span className="flex-1 text-xs text-secondary-foreground">{model.description}</span>
          </div>
          <Check
            className={cn("invisible ml-2 text-primary", {
              visible: model.enableThinking === modelState.enableThinking,
            })}
            size={16}
          />
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

export default ModelSelect;
