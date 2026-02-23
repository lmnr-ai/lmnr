"use client";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Globe, Link, Loader2, Lock, Share } from "lucide-react";
import React, { useState } from "react";

import { useTraceViewStoreContext } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";

const ShareTraceButton = ({ projectId }: { projectId: string; refetch?: () => void }) => {
  const { trace, updateTraceVisibility } = useTraceViewStoreContext((state) => ({
    trace: state.trace,
    updateTraceVisibility: state.updateTraceVisibility,
  }));

  const url = typeof window !== "undefined" ? `${window.location.origin}/shared/traces/${trace?.id}` : "";
  const [isLoading, setIsLoading] = useState(false);

  const { toast } = useToast();
  const handleChangeVisibility = async (value: "private" | "public") => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/projects/${projectId}/traces/${trace?.id}`, {
        method: "PUT",
        body: JSON.stringify({
          visibility: value,
        }),
      });

      if (res.ok) {
        toast({
          title: "Trace privacy updated.",
        });
        updateTraceVisibility(value);
      } else {
        const text = await res.json();
        if ("error" in text) {
          toast({ variant: "destructive", title: "Error", description: String(text.error) });
        }
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update trace privacy. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!trace) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={0}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button className="relative hover:bg-secondary px-1.5" variant="ghost">
                {trace.visibility === "public" ? <Globe className="h-4 w-4" /> : <Share className="h-4 w-4" />}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>Share Trace</TooltipContent>
          </TooltipPortal>
        </Tooltip>
        <PopoverContent className="flex flex-col gap-4 w-96" align="end">
          <div>
            <h2 className="text-md font-medium">Share trace</h2>
            <span className="text-sm text-secondary-foreground mt-2">Configure who has access to this trace.</span>
          </div>
          <div className="flex items-center space-x-2">
            <Select value={trace.visibility || "private"} onValueChange={handleChangeVisibility}>
              <SelectTrigger
                disabled={isLoading}
                value={trace.visibility || "private"}
                className="text-sm min-w-4 h-8 focus:ring-0"
              >
                <SelectValue placeholder="Select access">
                  <div className="flex items-center">
                    {isLoading ? (
                      <>
                        <Loader2 className="animate-spin w-4 h-4 mr-2" />
                        <span>Loading...</span>
                      </>
                    ) : trace.visibility === "public" ? (
                      <>
                        <Globe className="text-secondary-foreground h-4 w-4 mr-2" />
                        <span>Public</span>
                      </>
                    ) : (
                      <>
                        <Lock className="text-secondary-foreground h-4 w-4 mr-2" />
                        <span>Private</span>
                      </>
                    )}
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="private" value="private">
                  <div className="flex items-center">
                    <Lock className="text-secondary-foreground h-4 w-4 mr-2" />
                    <div className="flex flex-col gap-1">
                      <span>Private</span>
                      <span className="text-xs text-secondary-foreground">Only you can access this trace</span>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem key="public" value="public">
                  <div className="flex items-center">
                    <Globe className="text-secondary-foreground h-4 w-4 mr-2" />
                    <div className="flex flex-col gap-1">
                      <span>Public</span>
                      <span className="text-xs text-secondary-foreground">Everyone can view this trace</span>
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-row-reverse gap-2">
            <PopoverClose asChild>
              <Button variant="outline">Done</Button>
            </PopoverClose>
            {trace.visibility === "public" && (
              <CopyButton variant="lightSecondary" icon={<Link className="h-4 w-4 mr-2" />} text={url}>
                <span>Copy link</span>
              </CopyButton>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
};

export default ShareTraceButton;
