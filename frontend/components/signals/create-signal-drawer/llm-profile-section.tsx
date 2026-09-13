"use client";

import { AlertTriangle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import useSWR from "swr";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  selectTriggerWithIconClassName,
  SelectValue,
} from "@/components/ui/select";
import { ProviderIcon } from "@/components/workspace/llm-profiles/provider-icon";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { type LlmProfileOption } from "@/lib/actions/llm-profiles";
import { PROVIDER_LABELS } from "@/lib/actions/llm-profiles/schema";
import { Feature } from "@/lib/features/features";
import { cn, swrFetcher } from "@/lib/utils";

import { type ManageSignalForm } from "./types";

/**
 * Profile + model picker for self-hosted deployments. New signals must pick
 * both; an existing signal with no profile keeps running on env credentials
 * and is nudged to migrate.
 */
export default function LlmProfileSection() {
  const featureFlags = useFeatureFlags();
  if (!featureFlags[Feature.SIGNAL_LLM_PROFILES]) return null;
  return <LlmProfileFields />;
}

function LlmProfileFields() {
  const { projectId } = useParams();
  const { settingsHref } = useProjectContext();
  const { control, watch, setValue, getValues } = useFormContext<ManageSignalForm>();
  const { data: profiles, isLoading } = useSWR<LlmProfileOption[]>(
    `/api/projects/${projectId}/llm-profiles`,
    swrFetcher
  );

  const isExisting = Boolean(getValues("id"));
  const profileId = watch("llmProfileId");
  const selectedProfile = profiles?.find((p) => p.id === profileId);
  const models = selectedProfile?.models ?? [];
  const isEmpty = !isLoading && (profiles?.length ?? 0) === 0;

  // Preselect the only profile (and its first model) on a fresh form so the common case is one click fewer.
  useEffect(() => {
    if (!profiles || profiles.length !== 1 || isExisting || getValues("llmProfileId")) return;
    const [only] = profiles;
    setValue("llmProfileId", only.id, { shouldDirty: true, shouldValidate: true });
    setValue("llmModel", only.models[0] ?? null, { shouldDirty: true, shouldValidate: true });
  }, [profiles, isExisting, getValues, setValue]);

  const settingsLink = (
    <Link
      href={settingsHref("llm-profiles")}
      className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
    >
      Settings
      <ExternalLink className="size-3" />
    </Link>
  );

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">LLM</Label>
        {settingsLink}
      </div>
      {isExisting && !profileId && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-yellow-600" />
          <p>
            This signal runs on the server&apos;s <code>LLM_PROVIDER</code> environment configuration. Select an LLM
            profile and model to move it to workspace-managed credentials.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Controller
          control={control}
          name="llmProfileId"
          rules={{ validate: (v) => isExisting || !!v || "Select an LLM profile" }}
          render={({ field, fieldState }) => (
            <div className="grid gap-1.5">
              <Select
                value={field.value ?? ""}
                disabled={isEmpty || isLoading}
                onValueChange={(v) => {
                  field.onChange(v);
                  const next = profiles?.find((p) => p.id === v);
                  setValue("llmModel", next?.models[0] ?? null, { shouldDirty: true, shouldValidate: true });
                }}
              >
                <SelectTrigger className={cn("h-8 text-sm", selectTriggerWithIconClassName)}>
                  <SelectValue placeholder={isEmpty ? "No profiles yet" : "Profile"} />
                </SelectTrigger>
                <SelectContent>
                  {profiles?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2 leading-none">
                        <ProviderIcon provider={p.provider} />
                        {p.name}
                        <span className="text-xs text-muted-foreground">{PROVIDER_LABELS[p.provider]}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
            </div>
          )}
        />
        <Controller
          control={control}
          name="llmModel"
          rules={{ validate: (v) => (isExisting && !getValues("llmProfileId")) || !!v || "Select a model" }}
          render={({ field, fieldState }) => (
            <div className="grid gap-1.5">
              <Select value={field.value ?? ""} disabled={!selectedProfile} onValueChange={field.onChange}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
            </div>
          )}
        />
      </div>
      {isEmpty && (
        <p className="text-xs text-muted-foreground">
          Add an LLM profile in workspace settings before creating a signal.
        </p>
      )}
    </div>
  );
}
