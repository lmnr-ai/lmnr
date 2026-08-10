"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { Switch } from "@/components/ui/switch";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { Feature } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";
import { type Workspace } from "@/lib/workspaces/types";

interface PrivacyModeProps {
  workspace: Workspace;
  isOwner: boolean;
}

export default function PrivacyMode({ workspace, isOwner }: PrivacyModeProps) {
  const { toast } = useToast();
  const flags = useFeatureFlags();

  // Enabled by default: a workspace with no stored setting is in Privacy Mode.
  const [enabled, setEnabled] = useState(workspace.settings?.privacyMode ?? true);
  const [isLoading, setIsLoading] = useState(false);

  // Cloud-only. Self-hosted deployments never send data to Laminar, so the
  // toggle would be meaningless noise there.
  if (!flags[Feature.LAMINAR_CLOUD]) {
    return null;
  }

  const onToggle = async (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { privacyMode: next } }),
      });

      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: errMessage ?? "Failed to update Privacy Mode" });
        setEnabled(previous);
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to update Privacy Mode" });
      setEnabled(previous);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SettingsSection>
      <SettingsSectionHeader
        size="sm"
        title="Privacy Mode"
        description="When Privacy Mode is on, data from this workspace is never used to train or improve Laminar models. When it is off, redacted trace data may be used for model improvement. Turning Privacy Mode back on stops future use but cannot un-train models."
      />
      <div className="flex items-center gap-3">
        <Switch checked={enabled} onCheckedChange={onToggle} disabled={!isOwner || isLoading} />
        <span className="text-sm text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
        <Link
          href="/policies/data-use"
          target="_blank"
          className="inline-flex items-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          How Laminar uses data
          <ArrowUpRight data-icon="inline-end" className="ml-1 size-3" />
        </Link>
      </div>
    </SettingsSection>
  );
}
