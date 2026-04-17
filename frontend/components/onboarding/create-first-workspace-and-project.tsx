"use client";

import { ArrowRight, ExternalLink, Loader2, Mail, Radio } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { LaminarLogo } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateFirstWorkspaceAndProjectProps {
  name?: string | null;
}

export default function CreateFirstWorkspaceAndProject({ name }: CreateFirstWorkspaceAndProjectProps) {
  const [workspaceName, setWorkspaceName] = useState(name ? `${name}'s workspace` : "");
  const [projectName, setProjectName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();

  const handleButtonClick = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({
          name: workspaceName,
          projectName,
          isFirstProject: true,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create workspace");
      }

      const newWorkspace = (await res.json()) as { id: string; name: string; tierName: string; projectId?: string };

      if (newWorkspace.projectId) {
        router.push(`/project/${newWorkspace.projectId}/dashboards`);
      } else {
        router.push(`/workspace/${newWorkspace.id}`);
      }
      // We don't need to set isLoading to false, as we are redirecting.
      // Redirect itself takes some time, so we need the button to be disabled
    } catch (error) {
      console.error("Error during onboarding:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-lg border bg-secondary rounded-lg shadow-md overflow-hidden m-8">
        <div className="flex flex-col gap-1.5 px-8 pt-8 pb-6">
          <LaminarLogo className="h-7 w-auto mb-3" fill="#b5b5b5" />
          <h1 className="text-lg font-semibold text-secondary-foreground">Welcome to Laminar</h1>
          <p className="text-sm text-muted-foreground">
            Create your workspace and first project to start monitoring your AI agents.
          </p>
        </div>

        <form onSubmit={handleButtonClick} className="flex flex-col gap-5 px-8 pb-8">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="workspace-name" className="text-sm font-medium">
                Workspace name
              </Label>
              <Input
                id="workspace-name"
                type="text"
                placeholder="e.g. Acme Inc."
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-name" className="text-sm font-medium">
                Project name
              </Label>
              <Input
                id="project-name"
                type="text"
                placeholder="e.g. My AI Agent"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 border border-border px-4 py-4">
            <p className="text-sm font-medium text-secondary-foreground mb-3">Laminar will automatically set up</p>
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <Radio className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-secondary-foreground font-medium">Failure detector signal</span>
                  <span className="text-sm text-muted-foreground">
                    Runs on every LLM / agent trace to detect application errors, unhandled exceptions, and failures –
                    so issues are tracked and surfaced automatically.{" "}
                    <a
                      href="https://laminar.sh/docs/signals"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-primary hover:underline"
                    >
                      Learn more
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-secondary-foreground font-medium">Email summary reports</span>
                  <span className="text-sm text-muted-foreground">
                    Weekday and weekly digests with a summary of your agents' behavior – overall health, error trends,
                    and key patterns – delivered straight to your inbox
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground/70">
              Customize or remove anytime from signals and settings.
            </p>
          </div>

          <Button type="submit" disabled={!workspaceName || !projectName || isLoading} className="w-full">
            {isLoading ? (
              <Loader2 className="animate-spin h-4 w-4" />
            ) : (
              <>
                Go to project
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
