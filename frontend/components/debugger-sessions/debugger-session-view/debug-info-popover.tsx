"use client";

import { Info } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/lib/hooks/use-toast";

// TODO: replace with the real "run your agent in debug mode" prompt when ready.
const DEBUG_PROMPT = "TODO: debug-mode prompt — pending copy.";
// TODO: replace with the real debugger docs URL when ready.
const DOCS_URL = "#";

// Info popover in the session header (opens on click). Figma 4295:35584 / 4295:35371.
export default function DebugInfoPopover() {
  const { toast } = useToast();

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(DEBUG_PROMPT);
      toast({ title: "Copied prompt", duration: 1500 });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy — clipboard unavailable" });
    }
  }, [toast]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Building, debugging, or testing?"
          className="ml-1 flex size-6 items-center justify-center rounded text-secondary-foreground hover:bg-secondary"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[320px] flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium text-foreground">Building, debugging, or testing an agent?</h4>
          <p className="text-xs text-secondary-foreground">Teach your coding agent how to use debug mode.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleCopyPrompt}>
            Copy prompt
          </Button>
          {/* TODO: point at the real docs page when ready. */}
          <Button size="sm" variant="outline" asChild>
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
              Docs
            </a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
