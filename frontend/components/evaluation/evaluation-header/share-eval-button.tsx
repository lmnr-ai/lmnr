"use client";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Globe, Link, Loader2, Lock, Share } from "lucide-react";
import React, { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";

type EvalVisibility = "private" | "public";

interface ShareEvalButtonProps {
  evaluationId: string;
  projectId: string;
}

const ShareEvalButton = ({ evaluationId, projectId }: ShareEvalButtonProps) => {
  const url = typeof window !== "undefined" ? `${window.location.origin}/shared/evals/${evaluationId}` : "";
  const [visibility, setVisibility] = useState<EvalVisibility>("private");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch(`/api/projects/${projectId}/evaluations/${evaluationId}/visibility`)
      .then((res) => res.json())
      .then((data) => {
        if (data.visibility === "public" || data.visibility === "private") {
          setVisibility(data.visibility);
        }
      })
      .catch(() => {
        // Silently fail — default to private
      });
  }, [projectId, evaluationId]);

  const handleToggleVisibility = async () => {
    const next = visibility === "public" ? "private" : "public";
    try {
      setIsLoading(true);
      setVisibility(next); // optimistic update

      const res = await fetch(`/api/projects/${projectId}/evaluations/${evaluationId}`, {
        method: "PUT",
        body: JSON.stringify({ visibility: next }),
      });

      if (res.ok) {
        toast({ title: "Evaluation visibility updated." });
      } else {
        setVisibility(visibility); // revert
        const text = await res.json();
        toast({ variant: "destructive", title: "Error", description: String(text.error) });
      }
    } catch {
      setVisibility(visibility); // revert
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update evaluation visibility. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button className="relative hover:bg-secondary px-1.5" variant="secondary">
                {visibility === "public" ? <Globe className="h-4 w-4" /> : <Share className="h-4 w-4" />}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>Share Evaluation</TooltipContent>
          </TooltipPortal>
        </Tooltip>
        <PopoverContent className="flex flex-col gap-3 w-80" align="end">
          {visibility === "public" ? (
            <>
              <div className="flex items-center gap-5 pl-2">
                <Globe size={20} className="text-secondary-foreground flex-none" />
                <div>
                  <h2 className="text-sm font-medium">This evaluation is public</h2>
                  <p className="text-xs text-secondary-foreground">
                    Anyone with the link can view this evaluation and its traces.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CopyButton
                  className="flex-1 basis-0"
                  variant="lightSecondary"
                  disabled={isLoading}
                  icon={<Link className="h-4 w-4 mr-2" />}
                  text={url}
                >
                  <span>Copy link</span>
                </CopyButton>
                <Button
                  variant="outline"
                  disabled={isLoading}
                  onClick={handleToggleVisibility}
                  className="flex-1 basis-0"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
                  Make private
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-5 pl-2">
                <Lock size={20} className="text-secondary-foreground flex-none" />
                <div>
                  <h2 className="text-sm font-medium">This evaluation is private</h2>
                  <p className="text-xs text-secondary-foreground">Only project members can access this evaluation.</p>
                </div>
              </div>
              <Button variant="default" className="w-full" disabled={isLoading} onClick={handleToggleVisibility}>
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
                Share publicly
              </Button>
              <p className="text-xs text-secondary-foreground">
                All traces belonging to this evaluation will also become public.
              </p>
            </>
          )}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
};

export default ShareEvalButton;
