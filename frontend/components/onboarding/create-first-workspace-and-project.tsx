"use client";

import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

import icon from "@/assets/logo/icon.svg";
import { Button } from "@/components/ui/button";
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

  const handleButtonClick = async () => {
    setIsLoading(true);

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({
          name: workspaceName,
          projectName,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create workspace");
      }

      const newWorkspace = (await res.json()) as { id: string; name: string; tierName: string; projectId?: string };

      // Populate default dashboard charts for the created project

      // As we want user to start from traces page, redirect to it
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
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-6">
            <Image alt="Laminar AI icon" src={icon} width={40} height={40} />
          </div>
          <h1 className="text-3xl font-semibold mb-2">Welcome to Laminar</h1>
          <p className="text-sm text-muted-foreground text-center">
            Let's set up your workspace and first project to get started
          </p>
        </div>
        <div className="grid gap-4 px-8">
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && workspaceName && projectName && !isLoading) {
                  handleButtonClick();
                }
              }}
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && workspaceName && projectName && !isLoading) {
                  handleButtonClick();
                }
              }}
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleButtonClick}
              disabled={!workspaceName || !projectName || isLoading}
              className="self-end align-end w-fit"
            >
              {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Create workspace and project
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
