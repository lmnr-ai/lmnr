"use client";

import { Check, SquareArrowOutUpRight } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { CardExpandIndicator } from "@/components/ui/card-expand-indicator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";

import SetupStep from "./setup-step";

// TODO: point to the release tracking guide once it is published.
const RELEASES_DOCS_URL = "https://laminar.sh/docs";

interface VersioningSetupProps {
  projectId: string;
  releaseMode: boolean;
}

/** Collapsed once complete; while incomplete, a user's collapse is remembered per project. */
export default function VersioningSetup({ projectId, releaseMode }: VersioningSetupProps) {
  const [collapsed, setCollapsed] = useLocalStorage(`agent-versions:setup-collapsed:${projectId}`, false);
  const [completeOpen, setCompleteOpen] = useState(false);

  const open = releaseMode ? completeOpen : !collapsed;
  const onOpenChange = (next: boolean) => (releaseMode ? setCompleteOpen(next) : setCollapsed(!next));
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="rounded-md border">
      <CollapsibleTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className="group flex cursor-pointer h-11 items-center gap-3 rounded-md px-4 hover:bg-emphasis-1 transition-colors"
        >
          <span className="text-sm font-medium">Versioning setup</span>
          <Badge
            variant="outline"
            className={cn(
              "h-5 gap-1 px-1.5 font-normal",
              releaseMode ? "border-success/40 text-success" : "text-muted-foreground"
            )}
          >
            {releaseMode && <Check className="size-3" />}
            {releaseMode ? 2 : 1}/2
          </Badge>
          <span className="flex-1 text-xs text-muted-foreground">
            {releaseMode ? "Versioned by git releases" : "Release tracking not set up"}
          </span>
          <CardExpandIndicator expanded={open} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
          <SetupStep
            done
            title="Automatic versioning"
            description="New versions are detected from changes to the system prompt and tools in your traces."
          />
          <SetupStep
            done={releaseMode}
            title="Release tracking"
            description={
              releaseMode ? (
                "Versions are grouped by the git release set on your traces."
              ) : (
                <>
                  Set <code className="font-mono">LMNR_RELEASE</code> to the git commit SHA in your deployment to pin
                  each trace to the release that shipped it. Recommended for the most accurate version detection.{" "}
                  <a
                    href={RELEASES_DOCS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary-text hover:underline"
                  >
                    Setup guide
                    <SquareArrowOutUpRight className="size-3" />
                  </a>
                </>
              )
            }
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
