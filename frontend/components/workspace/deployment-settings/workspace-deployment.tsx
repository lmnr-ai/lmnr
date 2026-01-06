"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section.tsx";
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
import { Label } from "@/components/ui/label.tsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import HybridSetup from "@/components/workspace/deployment-settings/hybrid-setup.tsx";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { swrFetcher } from "@/lib/utils.ts";
import { DeploymentType, WorkspaceDeploymentSettings } from "@/lib/workspaces/types.ts";

export interface DeploymentManagementForm
  extends Pick<WorkspaceDeploymentSettings, "publicKey" | "dataPlaneUrl" | "mode"> { }

const WorkspaceDeployment = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
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
      // Reset verification when data changes (e.g., after save)
      setIsVerified(false);
    }
  }, [data, reset]);

  const isModeChanged = mode !== data?.mode;
  const isDirty = isModeChanged || (mode === DeploymentType.HYBRID && dataPlaneUrl !== data?.dataPlaneUrl);

  // Determine if save should be enabled
  const canSave = (() => {
    if (!isDirty) return false;
    if (isSaving) return false;

    // When switching to HYBRID mode, require keys and verified URL
    if (mode === DeploymentType.HYBRID) {
      return Boolean(publicKey) && isVerified;
    }

    // For CLOUD mode, just need to be dirty
    return true;
  })();

  const handleModeChange = useCallback(
    (newMode: DeploymentType) => {
      setValue("mode", newMode);
      // Reset verification when mode changes
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
    // Show confirmation dialog if mode is changing
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
        <SettingsSectionHeader title="Deployment" description="Choose how your application is deployed" />
        <SettingsSection>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </SettingsSection>
      </>
    );
  }

  if (error) {
    return (
      <>
        <SettingsSectionHeader title="Deployment" description="Choose how your application is deployed" />
        <SettingsSection>
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load deployment settings"}
            </p>
          </div>
        </SettingsSection>
      </>
    );
  }

  return (
    <FormProvider {...methods}>
      <div className="space-y-6">
        <SettingsSectionHeader title="Deployment" description="Choose how your application is deployed" />

        <RadioGroup value={mode} onValueChange={(value) => handleModeChange(value as DeploymentType)} disabled={isSaving}>
          <div className="space-y-3">
            <div className="flex items-start space-x-3 border rounded-lg p-4 cursor-pointer hover:bg-accent">
              <RadioGroupItem value={DeploymentType.CLOUD} id="cloud" />
              <Label htmlFor="cloud" className="flex-1 cursor-pointer">
                <div className="font-medium">Cloud Deployment</div>
                <div className="text-sm text-muted-foreground">Fully managed hosting by Laminar.</div>
              </Label>
            </div>

            <div className="flex items-start space-x-3 border rounded-lg p-4 cursor-pointer hover:bg-accent">
              <RadioGroupItem value={DeploymentType.HYBRID} id="hybrid" />
              <Label htmlFor="hybrid" className="flex-1 cursor-pointer">
                <div className="font-medium">Hybrid Deployment</div>
                <div className="text-sm text-muted-foreground">
                  Self-host your data while we manage the control plane.
                </div>
              </Label>
            </div>
          </div>
        </RadioGroup>

        {mode === DeploymentType.HYBRID && (
          <HybridSetup isSaving={isSaving} isVerified={isVerified} onVerifiedChange={setIsVerified} />
        )}

        {isDirty && (
          <div className="pt-4 space-y-2">
            <Button onClick={handleSaveClick} disabled={!canSave}>
              {isSaving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Save Configuration
            </Button>
            {mode === DeploymentType.HYBRID && !canSave && !isSaving && (
              <p className="text-sm text-muted-foreground">
                {!publicKey
                  ? "Generate API keys to enable saving."
                  : !isVerified
                    ? "Verify your deployment URL to enable saving."
                    : null}
              </p>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={showSaveConfirmation} onOpenChange={setShowSaveConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Deployment Mode?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {mode === DeploymentType.HYBRID ? (
                <>
                  <p>
                    Switching to <strong>Hybrid Deployment</strong> means all new data will be written to and read from
                    your self-hosted data plane.
                  </p>
                  <p className="text-destructive">
                    Warning: If your data plane is not configured properly, this may result in data loss or inability to
                    access your traces and logs.
                  </p>
                  <p>Make sure you have properly set up and verified your data plane before proceeding.</p>
                </>
              ) : (
                <>
                  <p>
                    Switching to <strong>Cloud Deployment</strong> means all new data will be written to and read from
                    Laminar&apos;s managed infrastructure.
                  </p>
                  <p className="text-destructive">
                    Warning: Data stored in your self-hosted data plane will no longer be accessible through this
                    workspace.
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSave}>Save Configuration</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormProvider>
  );
};

export default WorkspaceDeployment;
