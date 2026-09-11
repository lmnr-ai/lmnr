"use client";

import { ArrowUpRight, Lock } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { type PiiMode } from "@/lib/actions/project/settings";
import { Feature } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";
import { WorkspaceTier, type WorkspaceRole } from "@/lib/workspaces/types";

import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsSection, SettingsSectionHeader } from "./settings-section";

const PRO_TIERS: WorkspaceTier[] = [WorkspaceTier.PRO, WorkspaceTier.ENTERPRISE];

const MODE_LABELS: Record<PiiMode, { label: string; description: string }> = {
  off: { label: "Off", description: "Spans are stored as received." },
  redact: {
    label: "On",
    description: "Detected PII is replaced with placeholders before storage. Nobody can see the original text.",
  },
  dual: {
    label: "Dual",
    description: "Workspace owners and admins see the original data; members see the redacted copy.",
  },
};

export default function PiiRedaction({ currentUserRole }: { currentUserRole: WorkspaceRole }) {
  const { project, workspace, settingsHref, mutateProject } = useProjectContext();
  const { projectId } = useParams();
  const { toast } = useToast();
  const flags = useFeatureFlags();

  // Read straight off the live (SWR-backed) project so the control reflects
  // the shared source of truth and stays correct across remounts.
  const mode: PiiMode = project?.settings.piiMode ?? "off";
  const [isLoading, setIsLoading] = useState(false);

  // Self-hosted installs aren't on tiered billing, so the Pro gate only
  // applies on Laminar Cloud. Mirror of the server gate in
  // `lib/actions/project/settings.ts`.
  const isCloud = flags[Feature.LAMINAR_CLOUD];
  const isProTier = !isCloud || (workspace ? PRO_TIERS.includes(workspace.tierName) : false);
  const canEdit = currentUserRole === "owner" || currentUserRole === "admin";
  const modes: PiiMode[] = flags[Feature.PII_DUAL_MODE] ? ["off", "redact", "dual"] : ["off", "redact"];

  // Optimistically set piiMode in the shared project cache; revert on error.
  const setMode = (value: PiiMode) =>
    mutateProject((cur) => (cur ? { ...cur, settings: { ...cur.settings, piiMode: value } } : cur), {
      revalidate: false,
    });

  const onChange = async (next: PiiMode) => {
    if (!isProTier || !canEdit || next === mode) return;
    const previous = mode;
    setMode(next);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { piiMode: next } }),
      });

      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({
          variant: "destructive",
          title: errMessage ?? "Failed to update PII redaction setting",
        });
        setMode(previous);
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to update PII redaction setting" });
      setMode(previous);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SettingsSection>
      <SettingsSectionHeader
        size="sm"
        title="PII in spans"
        description="How names, emails, phone numbers, and other detected PII in span inputs and outputs are handled at ingestion."
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Select
            value={mode}
            onValueChange={(value) => onChange(value as PiiMode)}
            disabled={!isProTier || !canEdit || isLoading}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modes.map((m) => (
                <SelectItem key={m} value={m}>
                  {MODE_LABELS[m].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isProTier && (
            <>
              <span className="ml-2 inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                <Lock className="size-3" />
                Pro plan required
              </span>
              {workspace && (
                <Button asChild size="sm" variant="outline" className="h-7">
                  <Link href={settingsHref("billing")}>
                    Upgrade plan
                    <ArrowUpRight data-icon="inline-end" className="ml-1 size-3" />
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {MODE_LABELS[mode].description}
          {!canEdit && " Only workspace owners and admins can change this."}
        </p>
      </div>
    </SettingsSection>
  );
}
