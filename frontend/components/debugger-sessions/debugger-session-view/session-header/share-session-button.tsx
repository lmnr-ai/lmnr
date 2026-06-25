"use client";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Globe, Link, Loader2, Lock, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";

type SessionVisibility = "private" | "public";

interface ShareSessionButtonProps {
  sessionId: string;
  projectId: string;
}

const ShareSessionButton = ({ sessionId, projectId }: ShareSessionButtonProps) => {
  const url = typeof window !== "undefined" ? `${window.location.origin}/shared/debugger-sessions/${sessionId}` : "";
  const [visibility, setVisibility] = useState<SessionVisibility>("private");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch(`/api/projects/${projectId}/debugger-sessions/${sessionId}/visibility`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data?.visibility === "public" || data?.visibility === "private") {
          setVisibility(data.visibility);
        }
      })
      .catch(() => {
        // Silently fail — default to private
      });
  }, [projectId, sessionId]);

  const handleToggleVisibility = async () => {
    const next = visibility === "public" ? "private" : "public";
    try {
      setIsLoading(true);
      setVisibility(next); // optimistic update

      const res = await fetch(`/api/projects/${projectId}/debugger-sessions/${sessionId}`, {
        method: "PUT",
        body: JSON.stringify({ visibility: next }),
      });

      if (res.ok) {
        toast({ title: "Session visibility updated." });
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
        description: "Failed to update session visibility. Please try again.",
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
              <button className="hover:text-primary-foreground flex flex-row items-center gap-2">
                Share
                {visibility === "public" ? <Globe className="size-3" /> : <Share className="size-3" />}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>Share Session</TooltipContent>
          </TooltipPortal>
        </Tooltip>
        <PopoverContent className="flex flex-col gap-3 w-80" align="start">
          {visibility === "public" ? (
            <>
              <div className="flex items-center gap-5 pl-2">
                <Globe size={20} className="text-secondary-foreground flex-none" />
                <div>
                  <h2 className="text-sm font-medium">This session is public</h2>
                  <p className="text-xs text-secondary-foreground">
                    Anyone with the link can view this session and its traces.
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
                  <h2 className="text-sm font-medium">This session is private</h2>
                  <p className="text-xs text-secondary-foreground">Only project members can access this session.</p>
                </div>
              </div>
              <Button variant="default" className="w-full" disabled={isLoading} onClick={handleToggleVisibility}>
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
                Share publicly
              </Button>
              <p className="text-xs text-secondary-foreground">
                All traces belonging to this session will also become public.
              </p>
            </>
          )}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
};

export default ShareSessionButton;
