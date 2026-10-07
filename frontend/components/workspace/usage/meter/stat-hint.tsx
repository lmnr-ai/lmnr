import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface StatHintProps {
  label: string;
  text: string;
  href: string;
}

export default function StatHint({ label, text, href }: StatHintProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="size-3.5 cursor-default" aria-label={`About ${label}`} />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {text}{" "}
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
            Learn more
          </a>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
