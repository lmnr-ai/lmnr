import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ModelSelectProps {
  model: string;
  onModelChange: (model: string) => void;
  enableThinking: boolean;
  onEnableThinkingChange: (value: boolean) => void;
}

const models: { value: string; name: string }[] = [
  {
    value: "claude-3-7-sonnet-latest",
    name: "Claude 3.7 Sonnet (Latest)",
  },
  {
    value: "claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet (20250219)",
  },
];

const options: { value: boolean; name: string }[] = [
  {
    value: true,
    name: "Extended",
  },
  {
    value: false,
    name: "Normal",
  },
];

const ModelSelect = ({ model, onModelChange, enableThinking, onEnableThinkingChange }: ModelSelectProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button className="hover:bg-zinc-700 w-64" variant="ghost">
        <span className="flex-1 text-left truncate">{models.find((m) => m.value === model)?.name ?? "-"}</span>
        <ChevronDown className="text-secondary-foreground min-w-4" size={16} />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      {models.map((m) => (
        <DropdownMenuItem
          key={m.value}
          onSelect={(e) => {
            e.preventDefault();
            onModelChange(m.value);
          }}
        >
          <span className="flex-1">{m.name}</span>
          <Check className={cn("invisible ml-2 text-primary", { visible: m.value === model })} size={16} />
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-secondary-foreground">Thinking mode</DropdownMenuLabel>
      {options.map((option) => (
        <DropdownMenuItem
          key={option.name}
          onSelect={(e) => {
            e.preventDefault();
            onEnableThinkingChange(option.value);
          }}
        >
          <span className="flex-1">{option.name}</span>
          <Check
            className={cn("invisible ml-2 text-primary", { visible: option.value === enableThinking })}
            size={16}
          />
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

export default ModelSelect;
