"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Layers, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useEmergingClusterId } from "@/components/signal/hooks/use-emerging-cluster-id";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";

export default function EmergingClusterBreadcrumbs() {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();
  const signal = useSignalStoreContext((state) => state.signal);
  const [emergingClusterId, setEmergingClusterId] = useEmergingClusterId();

  const [name, setName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!emergingClusterId) {
      setName(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    const fetchName = async () => {
      try {
        const res = await fetch(
          `/api/projects/${params.projectId}/signals/${signal.id}/events/emerging-cluster/${emergingClusterId}`,
          {
            signal: controller.signal,
          }
        );

        if (!res.ok) {
          const errMessage = await res
            .json()
            .then((d) => d?.error)
            .catch(() => null);
          toast({ variant: "destructive", title: errMessage ?? "Failed to load emerging cluster" });
          setName(null);
          return;
        }

        const data = (await res.json()) as { name: string };
        setName(data.name);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        toast({ variant: "destructive", title: "Failed to load emerging cluster" });
        setName(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchName();

    return () => controller.abort();
  }, [emergingClusterId, params.projectId, signal.id, toast]);

  const label = isLoading && !name ? "Loading..." : (name ?? "Similar events");
  const prefix = "Emerging cluster:";

  return (
    <div className="flex gap-2 flex-wrap">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="flex gap-2 border-primary bg-primary/10 py-1 px-2 min-w-8 max-w-full" variant="outline">
              <Layers className="w-3 h-3 text-primary shrink-0" />
              <span className="text-xs text-primary/60 shrink-0 font-mono">{prefix}</span>
              <span className="text-xs text-primary truncate font-mono">{label}</span>
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
            <TooltipContent className="border">
              Group of similar events, not yet enough volume to form a cluster
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
