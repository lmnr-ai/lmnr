"use client";

import { ArrowUpRight, Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { Feature } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";
import { type Workspace } from "@/lib/workspaces/types";

interface PrivacyModeProps {
  workspace: Workspace;
  isOwner: boolean;
}

const DataUseLink = () => (
  <Link
    href="/policies/data-use"
    target="_blank"
    className="inline-flex items-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
  >
    Data Use policy
    <ArrowUpRight data-icon="inline-end" className="ml-1 size-3" />
  </Link>
);

export default function PrivacyMode({ workspace, isOwner }: PrivacyModeProps) {
  const { toast } = useToast();
  const flags = useFeatureFlags();

  const [enabled, setEnabled] = useState(workspace.privacyMode?.enabled ?? true);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const locked = workspace.privacyMode?.locked ?? false;

  // Cloud-only. Self-hosted deployments never send data to Laminar, so the
  // toggle would be meaningless noise there.
  //
  if (!flags[Feature.LAMINAR_CLOUD]) {
    return null;
  }

  const save = async (next: boolean) => {
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

  // Turning Privacy Mode ON is instant; turning it OFF goes through the
  // confirmation dialog, which owns the full disclosure.
  const onToggle = (next: boolean) => {
    if (next) {
      void save(true);
    } else {
      setConfirmOpen(true);
    }
  };

  const description = locked
    ? "Privacy Mode is enforced by your organization's data processing agreement."
    : enabled
      ? "Your Signal run data is not used to improve Signals models."
      : "Redacted data from Signal runs may be used to improve the models that power Signals.";

  return (
    <SettingsSection>
      <SettingsSectionHeader size="sm" title="Privacy Mode" description={description} />
      <div className="flex items-center gap-3">
        <Switch checked={enabled} onCheckedChange={onToggle} disabled={!isOwner || isLoading || locked} />
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          {locked && <Lock className="size-3.5" />}
          {enabled ? "Enabled" : "Disabled"}
        </span>
        <DataUseLink />
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Turn off Privacy Mode?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Allow Laminar to use redacted Signal run data from this workspace to improve the Signals models. Trace
            content processed by Signals is included after PII redaction. You can turn Privacy Mode back on at any time,
            which stops future use; data already used in completed training runs cannot be removed from those models.
          </p>
          <DataUseLink />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                void save(false);
              }}
            >
              Turn off Privacy Mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
