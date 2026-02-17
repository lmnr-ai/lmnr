"use client";

import { Cloud, Loader2, Lock, Server } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import useSWR from "swr";

import { SettingsSectionHeader } from "@/components/settings/settings-section.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import HybridSetup from "@/components/workspace/deployment-settings/hybrid-setup.tsx";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { cn, swrFetcher } from "@/lib/utils.ts";
import {
  DeploymentType,
  type Workspace,
  type WorkspaceDeploymentSettings,
  WorkspaceTier,
} from "@/lib/workspaces/types.ts";

export type DeploymentManagementForm = Pick<WorkspaceDeploymentSettings, "publicKey" | "dataPlaneUrl" | "mode">;
const DATA_PLANE_ADDON = "data-plane";

interface WorkspaceDeploymentProps {
  workspace: Workspace;
}

const WorkspaceDeployment = ({ workspace }: WorkspaceDeploymentProps) => {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const isPro = workspace.tierName === WorkspaceTier.PRO || workspace.tierName === WorkspaceTier.ENTERPRISE;
  const hasDataPlaneAddon = workspace.addons?.includes(DATA_PLANE_ADDON) ?? false;
  const isEnabled = isPro && hasDataPlaneAddon;
  const methods = useForm<DeploymentManagementForm>();
  const { reset, watch, setValue } = methods;
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<WorkspaceDeploymentSettings>(
    `/api/workspaces/${workspaceId}/deployment`,
    swrFetcher
  );

  const mode = watch("mode");
  const dataPlaneUrl = watch("dataPlaneUrl");
  const publicKey = watch("publicKey");

  // Reset verification when workspace changes
  useEffect(() => {
    setIsVerified(false);
  }, [workspaceId]);

  useEffect(() => {
    if (data) {
      reset({
        mode: data.mode,
        publicKey: data.publicKey,
        dataPlaneUrl: data.dataPlaneUrl,
      });
      setIsVerified(false);
    }
  }, [data, reset]);

  const isModeChanged = mode !== data?.mode;
  const isDirty = isModeChanged || (mode === DeploymentType.HYBRID && dataPlaneUrl !== data?.dataPlaneUrl);

  // Determine if save should be enabled
  const canSave = (() => {
    if (!isDirty) return false;
    if (isSaving) return false;

    if (mode === DeploymentType.HYBRID) {
      return Boolean(publicKey) && isVerified;
    }

    return true;
  })();

  // Explanation of what's blocking save
  const saveBlockReason = (() => {
    if (!isDirty || isSaving) return null;
    if (mode === DeploymentType.HYBRID) {
      if (!publicKey) return "Generate API keys to continue.";
      if (!isVerified) return "Verify your deployment URL to continue.";
    }
    return null;
  })();

  const handleModeChange = useCallback(
    (newMode: DeploymentType) => {
      setValue("mode", newMode);
      setIsVerified(false);
    },
    [setValue]
  );

  const performSave = useCallback(async () => {
    try {
      setIsSaving(true);
      const body: { mode: DeploymentType; dataPlaneUrl?: string } = { mode: mode! };

      if (mode === DeploymentType.HYBRID && dataPlaneUrl) {
        body.dataPlaneUrl = dataPlaneUrl;
      }

      const response = await fetch(`/api/workspaces/${workspaceId}/deployment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error: string };
        toast({ variant: "destructive", title: "Error", description: error.error });
        return;
      }

      toast({ title: "Configuration saved" });
      mutate();
    } catch (e) {
      if (e instanceof Error) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    } finally {
      setIsSaving(false);
    }
  }, [mode, dataPlaneUrl, toast, workspaceId, mutate]);

  const handleSaveClick = useCallback(() => {
    if (isModeChanged) {
      setShowSaveConfirmation(true);
    } else {
      performSave();
    }
  }, [isModeChanged, performSave]);

  const confirmSave = useCallback(() => {
    setShowSaveConfirmation(false);
    performSave();
  }, [performSave]);

  if (isLoading) {
    return (
      <>
        <SettingsSectionHeader
          title="Data Residency"
          description="Choose where your workspace data is stored and processed."
        />
        <div className="flex flex-col gap-3 mt-2">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <SettingsSectionHeader
          title="Data Residency"
          description="Choose where your workspace data is stored and processed."
        />
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 mt-2">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load data residency settings"}
          </p>
        </div>
      </>
    );
  }

  return (
    <FormProvider {...methods}>
      <div className="space-y-6">
        <SettingsSectionHeader
          title="Data Residency"
          description="Choose where your workspace data is stored and processed."
        />

        {/* Upgrade / addon gate */}
        {!isEnabled && (
          <div className="rounded-lg border border-border bg-muted/30 p-5 flex items-start gap-4">
            <div className="flex items-center justify-center h-9 w-9 rounded-md bg-muted text-muted-foreground shrink-0">
              <Lock className="h-5 w-5" />
            </div>
            <div className="space-y-3 flex-1">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">
                  {!isPro
                    ? "Upgrade to Pro to configure data residency"
                    : "Add the Data Plane addon to configure data residency"}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {!isPro
                    ? "Data residency configuration is available on the Pro plan with the Data Plane addon."
                    : "Your workspace is on the Pro plan, but the Data Plane addon is required to enable hybrid data residency."}
                </p>
              </div>
              <Link href={`/workspace/${workspaceId}?menu=usage`}>
                <Button variant="outline" size="sm">
                  {!isPro ? "View pricing" : "Go to billing settings"}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Mode selection cards */}
        <div className={cn("grid gap-3 sm:grid-cols-2", !isEnabled && "opacity-90 pointer-events-none")}>
          <ModeCard
            icon={<Cloud className="h-5 w-5" />}
            title="Cloud"
            description="Data stored securely in Laminar cloud."
            isSelected={mode === DeploymentType.CLOUD}
            isActive={data?.mode === DeploymentType.CLOUD}
            disabled={isSaving || !isEnabled}
            onClick={() => handleModeChange(DeploymentType.CLOUD)}
          />
          <ModeCard
            icon={<Server className="h-5 w-5" />}
            title="Hybrid"
            description="Data stored securely in your infrastructure. Laminar handles processing only."
            isSelected={mode === DeploymentType.HYBRID}
            isActive={data?.mode === DeploymentType.HYBRID}
            disabled={isSaving || !isEnabled}
            onClick={() => handleModeChange(DeploymentType.HYBRID)}
          />
        </div>

        {/* Hybrid setup - shown when hybrid is selected */}
        {mode === DeploymentType.HYBRID && isEnabled && (
          <HybridSetup isSaving={isSaving} isVerified={isVerified} onVerifiedChange={setIsVerified} />
        )}

        {/* Unsaved changes bar */}
        {isDirty && isEnabled && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">Unsaved changes</p>
              {saveBlockReason && <p className="text-xs text-muted-foreground">{saveBlockReason}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSaveClick} disabled={!canSave}>
                {isSaving && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
                Save changes
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation dialog for mode changes */}
      <AlertDialog open={showSaveConfirmation} onOpenChange={setShowSaveConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change data residency mode?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {mode === DeploymentType.HYBRID ? (
                  <>
                    <p>
                      Switching to <strong>Hybrid</strong> means all new data will be written to and read from your
                      self-hosted data plane.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      Switching to <strong>Cloud</strong> means all new data will be written to and read from
                      Laminar&apos;s managed infrastructure.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSave}>Confirm &amp; save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormProvider>
  );
};

// ── Mode selection card ─────────────────────────────────────────────────

interface ModeCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  isSelected: boolean;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
}

function ModeCard({ icon, title, description, isSelected, isActive, disabled, onClick }: ModeCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative flex flex-col gap-2 rounded-lg border-2 p-4 text-left transition-colors",
        "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-90",
        isSelected ? "border-primary bg-primary/5" : "border-border"
      )}
    >
      {isActive && (
        <span className="absolute top-3 right-3 text-[10px] font-medium uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
          Current
        </span>
      )}
      <div
        className={cn(
          "flex items-center justify-center h-9 w-9 rounded-md",
          isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}

export default WorkspaceDeployment;
