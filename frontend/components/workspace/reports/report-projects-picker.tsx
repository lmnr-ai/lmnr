"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
        Uncheck projects you don&apos;t want in this report, such as test or staging projects. New projects are included
        automatically.
      </p>
      <div className="flex flex-col rounded-md border divide-y">
        {projects.map((project) => (
          <label key={project.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
            <Checkbox
              checked={!excluded.has(project.id)}
              onCheckedChange={(checked) => toggle(project.id, !!checked)}
              className="[&_svg]:!text-primary-foreground [&_svg]:!size-[10px]"
            />
            <span className="truncate">{project.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
