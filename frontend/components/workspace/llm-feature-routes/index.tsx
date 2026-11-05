"use client";

import { useState } from "react";
import useSWR from "swr";

import {
  SettingsSection,
  SettingsSectionHeader,
  SettingsTable,
  SettingsTableRow,
} from "@/components/settings/settings-section";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { type WorkspaceFeatureRoutes } from "@/lib/actions/llm-feature-routes";
import { type LlmProfile } from "@/lib/actions/llm-profiles/schema";
import { DEFAULT_FEATURE_GROUP_ID, LLM_FEATURE_GROUPS } from "@/lib/ai/feature-groups";
import { Feature } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

import RouteSelect from "./route-select";
import { groupTarget, type RouteTarget, unsetHint } from "./utils";

interface LlmFeatureRoutesProps {
  workspaceId: string;
  canEdit: boolean;
}

/** Self-hosted only: which workspace LLM profile + model each AI feature group runs on. */
export default function LlmFeatureRoutes({ workspaceId, canEdit }: LlmFeatureRoutesProps) {
  const featureFlags = useFeatureFlags();
  if (!featureFlags[Feature.LLM_FEATURE_ROUTES]) return null;
  return <LlmFeatureRoutesTable workspaceId={workspaceId} canEdit={canEdit} />;
}

function LlmFeatureRoutesTable({ workspaceId, canEdit }: LlmFeatureRoutesProps) {
  const featureFlags = useFeatureFlags();
  const { toast } = useToast();
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const routesKey = `/api/workspaces/${workspaceId}/llm-feature-routes`;
  const { data, isLoading, mutate } = useSWR<WorkspaceFeatureRoutes>(routesKey, swrFetcher);
  // Same key as the profiles section above, so a new profile or model shows up here at once.
  const { data: profiles, isLoading: profilesLoading } = useSWR<LlmProfile[]>(
    `/api/workspaces/${workspaceId}/llm-profiles`,
    swrFetcher
  );

  const groups = LLM_FEATURE_GROUPS.filter((g) => !g.requires || featureFlags[g.requires]);

  const save = async (groupId: string, target: RouteTarget | null) => {
    setSavingGroup(groupId);
    try {
      const res = await fetch(routesKey, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, target }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to update AI feature settings");
      }
      await mutate();
    } catch (error) {
      toast({ variant: "destructive", title: error instanceof Error ? error.message : "Something went wrong" });
    } finally {
      setSavingGroup(null);
    }
  };

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="AI features"
        description={
          canEdit
            ? "Choose the LLM profile and model each AI feature runs on. Signals pick their own profile per signal."
            : "The LLM profile and model each AI feature runs on. Only workspace owners and admins can change them."
        }
      />
      <SettingsTable
        headers={["Feature", "Model"]}
        colSpan={2}
        isLoading={isLoading || profilesLoading}
        loadingRowCount={groups.length}
      >
        {groups.map((group) => {
          const target = groupTarget(group.featureIds, data?.routes ?? []);
          const isDefault = group.id === DEFAULT_FEATURE_GROUP_ID;
          return (
            <SettingsTableRow key={group.id}>
              <td className="px-4 py-3 align-top">
                <div className="text-sm font-medium">{group.label}</div>
                <div className="text-xs text-muted-foreground">{group.description}</div>
                {target === null && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {unsetHint(isDefault, data?.envProviderConfigured ?? false)}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 align-top">
                <div className="flex justify-end">
                  <RouteSelect
                    profiles={profiles ?? []}
                    value={target}
                    disabled={!canEdit || savingGroup !== null}
                    onChange={(next) => save(group.id, next)}
                  />
                </div>
              </td>
            </SettingsTableRow>
          );
        })}
      </SettingsTable>
    </SettingsSection>
  );
}
