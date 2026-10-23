"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type Project } from "@/lib/workspaces/types";

interface ReportProjectsPickerProps {
  projects: Project[];
  excludedProjectIds: string[];
  onChange: (excludedProjectIds: string[]) => void;
}

export default function ReportProjectsPicker({ projects, excludedProjectIds, onChange }: ReportProjectsPickerProps) {
  const excluded = new Set(excludedProjectIds);
  const includedCount = projects.filter((p) => !excluded.has(p.id)).length;

  const toggle = (projectId: string, included: boolean) => {
    onChange(included ? excludedProjectIds.filter((id) => id !== projectId) : [...excludedProjectIds, projectId]);
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <Label>Projects</Label>
        <span className="text-xs text-muted-foreground">
          {includedCount} of {projects.length} included
        </span>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        Turn off projects you don&apos;t want in this report, such as test or staging projects. New projects are
        included automatically.
      </p>
      <div className="flex flex-col rounded-md border divide-y">
        {projects.map((project) => (
          <label key={project.id} className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="truncate">{project.name}</span>
            <Switch checked={!excluded.has(project.id)} onCheckedChange={(checked) => toggle(project.id, checked)} />
          </label>
        ))}
      </div>
    </div>
  );
}
