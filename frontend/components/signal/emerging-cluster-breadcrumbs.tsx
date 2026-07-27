"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Layers, X } from "lucide-react";

import { useEmergingClusterId } from "@/components/signal/hooks/use-emerging-cluster-id";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function EmergingClusterBreadcrumbs() {
  const [, setEmergingClusterId] = useEmergingClusterId();

  return (
    <div className="flex gap-2 flex-wrap">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="flex gap-2 border-primary bg-primary/10 py-1 px-2 min-w-8 max-w-full" variant="outline">
              <Layers className="w-3 h-3 text-primary shrink-0" />
              <span className="text-xs text-primary truncate font-mono">Emerging Cluster</span>
              <Button
                onClick={() => setEmergingClusterId(null)}
                className="p-0 h-fit group"
                variant="ghost"
                aria-label="Clear emerging cluster filter"
              >
                <X className="w-3 h-3 text-primary/70 group-hover:text-primary" />
              </Button>
            </Badge>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>Group of similar events, not yet enough volume to form a cluster</TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
