"use client";

import { Loader2 } from "lucide-react";
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
        router.push(`/project/${newWorkspace.projectId}/traces`);
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
    <div className="flex-1 flex items-center justify-center pb-16">
      <div className="w-full max-w-md border bg-secondary p-8 rounded">
        <div className="flex flex-col items-start mb-8">
          <div className="mb-4">
            <LaminarLogo className="h-7 w-auto" fill="#b5b5b5" />
          </div>
          <p className="text-sm text-muted-foreground">Let's set up your workspace and first project to get started</p>
        </div>
        <form onSubmit={handleButtonClick} className="grid gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="workspace-name" className="text-xs font-medium">
              Workspace Name
            </Label>
            <Input
              id="workspace-name"
              type="text"
              placeholder="Enter workspace name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="project-name" className="text-xs font-medium">
              Project Name
            </Label>
            <Input
              id="project-name"
              type="text"
              placeholder="Enter project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <div className="rounded-md bg-muted/50 border border-border px-3 py-3 text-xs text-muted-foreground">
            <p className="text-secondary-foreground font-medium mb-2">We'll set up a few things for you</p>
            <ul className="flex flex-col gap-1.5">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                <span>
                  A <span className="text-secondary-foreground font-medium">failure detector</span> signal that triggers
                  on failed traces
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                <span>
                  Subscribe you to <span className="text-secondary-foreground font-medium">weekday</span> and{" "}
                  <span className="text-secondary-foreground font-medium">weekly</span> signal summary reports to your
                  email
                </span>
              </li>
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground/70">
              These are free and you can customize or remove them anytime in signals and settings menus.
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!workspaceName || !projectName || isLoading}
              className="self-end align-end w-fit"
            >
              {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
