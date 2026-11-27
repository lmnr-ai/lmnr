import { Check, CopyIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/use-toast";

export interface CopyOption {
  label: string;
  /** Serialized on click, so large payloads cost nothing until copied. */
  getText: () => string;
}

const CopyMenu = ({ options }: { options: CopyOption[] }) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copy = async (getText: () => string) => {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ variant: "destructive", title: "Failed to copy" });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="text-foreground/80" aria-label={copied ? "Copied" : "Copy"}>
          {copied ? (
            <Check className="size-3.5 animate-in zoom-in-50 fade-in duration-200" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((option) => (
          <DropdownMenuItem key={option.label} onSelect={() => copy(option.getText)}>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CopyMenu;
