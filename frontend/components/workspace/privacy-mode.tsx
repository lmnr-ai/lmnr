"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { useToast } from "@/lib/hooks/use-toast";
import { withBasePath } from "@/lib/utils";

import { Switch } from "../ui/switch";

interface PrivacyModeProps {
  workspaceId: string;
  privacyMode: boolean;
  isOwner: boolean;
}

export default function PrivacyMode({ workspaceId, privacyMode, isOwner }: PrivacyModeProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [enabled, setEnabled] = useState(privacyMode);
  const [isLoading, setIsLoading] = useState(false);

  const onToggle = async (next: boolean) => {
    if (!isOwner) return;
    const previous = enabled;
    setEnabled(next);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/settings`, {
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
        return;
      }
      router.refresh();
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
        description="On by default. While Privacy Mode is on, Laminar never uses this workspace's traces to train or improve its models. Turning it off allows us to, with redaction applied first."
      />
      <div className="flex items-center gap-3">
        <Switch checked={enabled} onCheckedChange={onToggle} disabled={!isOwner || isLoading} />
        <span className="text-sm text-muted-foreground">{enabled ? "On" : "Off"}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {enabled
          ? "Your traces are not used for model training."
          : "Your traces may be used to train Laminar's models. Turning Privacy Mode back on stops future use, but cannot remove data from a model already trained on it."}{" "}
        <a href={withBasePath("/policies/data-use")} target="_blank" rel="noreferrer" className="underline">
          What this means
        </a>
      </p>
      {!isOwner && <p className="text-sm text-muted-foreground">Only the workspace owner can change this setting.</p>}
    </SettingsSection>
  );
}
