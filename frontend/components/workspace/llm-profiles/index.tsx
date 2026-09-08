"use client";

import { isEmpty } from "lodash";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import {
  SettingsSection,
  SettingsSectionHeader,
  SettingsTable,
  SettingsTableRow,
} from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type LlmProfile, PROVIDER_LABELS } from "@/lib/actions/llm-profiles/schema";
import { swrFetcher } from "@/lib/utils";

import DeleteProfileDialog from "./delete-profile-dialog";
import ManageProfileSheet from "./manage-profile-sheet";

interface LlmProfilesProps {
  workspaceId: string;
}

export default function LlmProfiles({ workspaceId }: LlmProfilesProps) {
  const { data, isLoading, mutate } = useSWR<LlmProfile[]>(`/api/workspaces/${workspaceId}/llm-profiles`, swrFetcher);
  const [editTarget, setEditTarget] = useState<LlmProfile | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LlmProfile | null>(null);

  const openEditor = (profile: LlmProfile | null) => {
    setEditTarget(profile);
    setSheetOpen(true);
  };

  return (
    <SettingsSection>
      <SettingsSectionHeader title="LLM Profiles" description="Provider credentials that signals run on." />
      <Button variant="outline" icon="plus" className="w-fit" onClick={() => openEditor(null)}>
        Profile
      </Button>
      <SettingsTable
        headers={["Name", "Provider", "Models", ""]}
        colSpan={4}
        isLoading={isLoading}
        isEmpty={isEmpty(data)}
        emptyMessage="No LLM profiles yet."
      >
        {data?.map((profile) => (
          <SettingsTableRow
            key={profile.id}
            className="cursor-pointer hover:bg-muted/40"
            onClick={() => openEditor(profile)}
          >
            <td className="px-4 text-sm font-medium">{profile.name}</td>
            <td className="px-4 text-sm text-muted-foreground whitespace-nowrap">
              {PROVIDER_LABELS[profile.provider]}
            </td>
            <td className="px-4">
              <div className="flex flex-wrap gap-1 py-2">
                {profile.models.map((model) => (
                  <Badge key={model} variant="outline" className="h-5 px-1.5 text-xs font-normal">
                    {model}
                  </Badge>
                ))}
              </div>
            </td>
            <td className="px-4">
              <div className="flex justify-end">
                <Button
                  aria-label="Delete"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(profile);
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </td>
          </SettingsTableRow>
        ))}
      </SettingsTable>

      <ManageProfileSheet
        workspaceId={workspaceId}
        profile={editTarget}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditTarget(null);
        }}
        onSaved={() => {
          mutate();
          setSheetOpen(false);
          setEditTarget(null);
        }}
      />
      <DeleteProfileDialog
        workspaceId={workspaceId}
        profile={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => mutate()}
      />
    </SettingsSection>
  );
}
