"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import HybridSetup from "@/components/workspace/deployment-settings/hybrid-setup.tsx";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { swrFetcher } from "@/lib/utils.ts";
import { DeploymentType, WorkspaceDeploymentSettings } from "@/lib/workspaces/types.ts";

export interface DeploymentManagementForm
  extends Pick<WorkspaceDeploymentSettings, "publicKey" | "dataPlaneUrl" | "mode"> {}

const WorkspaceDeployment = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const methods = useForm<DeploymentManagementForm>();
  const { reset, watch, setValue } = methods;
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<WorkspaceDeploymentSettings>(
    `/api/workspaces/${workspaceId}/deployment`,
    swrFetcher
  );

  const mode = watch("mode");
  const dataPlaneUrl = watch("dataPlaneUrl");

  useEffect(() => {
    if (data) {
      reset({
        mode: data.mode,
        publicKey: data.publicKey,
        dataPlaneUrl: data.dataPlaneUrl,
      });
    }
  }, [data, reset]);

  const isDirty = mode !== data?.mode || (mode === DeploymentType.HYBRID && dataPlaneUrl !== data?.dataPlaneUrl);

  const handleSave = useCallback(async () => {
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

        <RadioGroup value={mode} onValueChange={(value) => setValue("mode", value as DeploymentType)}>
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

        {mode === DeploymentType.HYBRID && <HybridSetup isSaving={isSaving} />}

        {isDirty && (
          <div className="pt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Save Configuration
            </Button>
          </div>
        )}
      </div>
    </FormProvider>
  );
};

export default WorkspaceDeployment;
