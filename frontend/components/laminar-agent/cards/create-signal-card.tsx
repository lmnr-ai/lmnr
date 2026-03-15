"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";

interface CreateSignalCardProps {
  signalName: string;
  signalDescription: string;
  prompt: string;
}

export default function CreateSignalCard({ props }: { props: CreateSignalCardProps }) {
  const { signalName, signalDescription, prompt } = props;
  const { projectId } = useParams();

  const navigateToSignals = useCallback(() => {
    const params = new URLSearchParams({
      create: "true",
      name: signalName,
      description: signalDescription,
      prompt,
    });
    window.open(`/project/${projectId}/signals?${params.toString()}`, "_blank");
  }, [projectId, signalName, signalDescription, prompt]);

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex items-start gap-3 p-4">
        <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <span className="font-medium text-sm">{signalName}</span>
          <p className="text-xs text-muted-foreground">{signalDescription}</p>
          <p className="text-xs text-foreground/80 bg-muted/50 rounded p-2 font-mono max-h-32 overflow-y-auto">
            {prompt}
          </p>
          <Button variant="outline" size="sm" className="self-start gap-1.5 text-xs" onClick={navigateToSignals}>
            Continue to create signal
            <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
