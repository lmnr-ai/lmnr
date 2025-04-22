"use client";
import { Globe, Lock, Share } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";

import { CopyLinkButton } from "@/components/traces/copy-link-button";
import { Button } from "@/components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";
import { Trace } from "@/lib/traces/types";

const ShareTraceButton = ({ trace, projectId }: { trace: Pick<Trace, "id" | "visibility">; projectId: string }) => {
  const traceId = trace.id;
  const router = useRouter();

  const url = `${window.location.origin}/shared/traces/${traceId}`;

  const { toast } = useToast();
  const handleChangeVisibility = async (value: "private" | "public") => {
    try {
      const res = await fetch(`/api/projects/${projectId}/traces/${traceId}`, {
        method: "PUT",
        body: JSON.stringify({
          visibility: value,
        }),
      });

      if (res.ok) {
        toast({
          title: "Trace privacy updated.",
        });
        router.refresh();
      } else {
        const text = await res.json();
        toast({ variant: "destructive", title: "Error", description: text });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update trace privacy. Please try again.",
      });
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button className="hover:bg-secondary px-1.5" variant="ghost">
                <Share className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Share Trace</TooltipContent>
        </Tooltip>
        <PopoverContent className="flex flex-col gap-4 w-96" align="end">
          <div>
            <h2 className="text-lg">Share Trace</h2>
            <span className="text-sm text-secondary-foreground mt-2">Configure who has access to this trace.</span>
          </div>
          <div className="flex items-center space-x-2">
            <Select value={trace.visibility || "private"} onValueChange={handleChangeVisibility}>
              <SelectTrigger value={trace.visibility || "private"} className="text-sm min-w-4 h-8">
                <SelectValue placeholder="Select access">
                  {trace.visibility === "public" ? (
                    <div className="flex items-center">
                      <Globe className="text-secondary-foreground h-4 w-4 mr-2" />
                      <span>Public</span>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <Lock className="text-secondary-foreground h-4 w-4 mr-2" />
                      <span>Private</span>
                    </div>
                  )}
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
              <Button variant="lightSecondary">Done</Button>
            </PopoverClose>
            {trace.visibility === "public" && (
              <CopyLinkButton url={url}>
                <span>Copy link</span>
              </CopyLinkButton>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
};

export default ShareTraceButton;
