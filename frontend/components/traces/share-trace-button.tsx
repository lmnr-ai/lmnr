"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Copy, Globe, Loader2, Lock, Share } from "lucide-react";
import { useState } from "react";
import { shallow } from "zustand/shallow";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

const ShareTraceButton = ({ projectId }: { projectId: string }) => {
  const { trace, updateTraceVisibility } = useTraceViewStore(
    (state) => ({ trace: state.trace, updateTraceVisibility: state.updateTraceVisibility }),
    shallow
  );
  const [isVisibilityLoading, setIsVisibilityLoading] = useState(false);
  const { toast } = useToast();
  const handleChangeVisibility = async (visibility: "private" | "public") => {
    if (!trace || trace.visibility === visibility) return;
    try {
      setIsVisibilityLoading(true);
      const res = await fetch(`/api/projects/${projectId}/traces/${trace.id}`, {
        method: "PUT",
        body: JSON.stringify({ visibility }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to update trace privacy");
      }
      updateTraceVisibility(visibility);
      track("traces", "visibility_changed", { visibility });
      toast({ title: "Trace privacy updated." });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update trace privacy. Please try again.",
      });
    } finally {
      setIsVisibilityLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!trace) return;
    await navigator.clipboard.writeText(`${window.location.origin}/shared/traces/${trace.id}`);
    track("traces", "share_link_copied");
    toast({ title: "Copied share link", duration: 1000 });
  };

  if (!trace) return null;

  return (
    <DropdownMenu>
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button className="relative hover:bg-surface-up" variant="ghost" size="icon" aria-label="Share trace">
              {trace.visibility === "public" ? <Globe className="size-3.5" /> : <Share className="size-3.5" />}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>Share trace</TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel className="pb-1 text-xs font-normal text-muted-foreground">Share trace</DropdownMenuLabel>
        <div className="px-1 pb-1" onKeyDown={(event) => event.stopPropagation()}>
          <Select
            value={trace.visibility ?? "private"}
            disabled={isVisibilityLoading}
            onValueChange={(visibility: "private" | "public") => handleChangeVisibility(visibility)}
          >
            <SelectTrigger className="h-7 border-0 bg-surface-up-2 px-2 shadow-none hover:bg-muted">
              {isVisibilityLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <SelectValue>
                  <span className="flex items-center gap-2">
                    {trace.visibility === "public" ? (
                      <Globe className="size-3.5 text-muted-foreground" />
                    ) : (
                      <Lock className="size-3.5 text-muted-foreground" />
                    )}
                    <span>{trace.visibility === "public" ? "Public" : "Private"}</span>
                  </span>
                </SelectValue>
              )}
            </SelectTrigger>
            <SelectContent className="w-56">
              <SelectItem value="private" className="py-2">
                <span className="flex items-start gap-2">
                  <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex flex-col">
                    <span className="font-medium">Private</span>
                    <span className="text-[11px] leading-tight text-muted-foreground">
                      Only you can access this trace
                    </span>
                  </span>
                </span>
              </SelectItem>
              <SelectItem value="public" className="py-2">
                <span className="flex items-start gap-2">
                  <Globe className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex flex-col">
                    <span className="font-medium">Public</span>
                    <span className="text-[11px] leading-tight text-muted-foreground">
                      Anyone with a link can view this trace
                    </span>
                  </span>
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {trace.visibility === "public" && (
          <DropdownMenuItem onClick={handleCopyLink}>
            <Copy className="size-3.5" />
            Copy share link
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ShareTraceButton;
