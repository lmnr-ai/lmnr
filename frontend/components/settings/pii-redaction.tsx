"use client";

import { ArrowUpRight, Lock } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { Feature } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";
import { WorkspaceTier } from "@/lib/workspaces/types";

import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { SettingsSection, SettingsSectionHeader } from "./settings-section";

const PRO_TIERS: WorkspaceTier[] = [WorkspaceTier.PRO, WorkspaceTier.ENTERPRISE];

export default function PiiRedaction() {
  const { project, workspace } = useProjectContext();
  const { projectId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const flags = useFeatureFlags();

  const [enabled, setEnabled] = useState<boolean>(project?.settings.removePii ?? false);
  const [isLoading, setIsLoading] = useState(false);

  // Self-hosted installs aren't on tiered billing, so the Pro gate only
  // applies on Laminar Cloud. Mirror of the server gate in
  // `lib/actions/project/settings.ts`.
  const isCloud = flags[Feature.LAMINAR_CLOUD];
  const isProTier = !isCloud || (workspace ? PRO_TIERS.includes(workspace.tierName) : false);

  const onToggle = async (next: boolean) => {
    if (!isProTier) return;
    // Optimistic — revert on error.
    const previous = enabled;
    setEnabled(next);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { removePii: next } }),
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
        setEnabled(previous);
        return;
      }
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Failed to update PII redaction setting" });
      setEnabled(previous);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SettingsSection>
      <SettingsSectionHeader
        size="sm"
        title="Redact PII from spans"
        description="When enabled, every span ingested for this project is run through the PII redactor before storage. Names, emails, phone numbers, and other detected PII are replaced with placeholders in inputs and outputs."
      />
      <div className="flex items-center gap-3">
        <Switch checked={enabled} onCheckedChange={onToggle} disabled={!isProTier || isLoading} />
        <span className="text-sm text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
        {!isProTier && (
          <>
            <span className="ml-2 inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <Lock className="size-3" />
              Pro plan required
            </span>
            {workspace && (
              <Button asChild size="sm" variant="outline" className="h-7">
                <Link href={`/workspace/${workspace.id}?tab=billing`}>
                  Upgrade plan
                  <ArrowUpRight className="ml-1 size-3" />
                </Link>
              </Button>
            )}
          </>
        )}
      </div>
    </SettingsSection>
  );
}
