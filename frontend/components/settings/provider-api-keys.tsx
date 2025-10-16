"use client";

import { isEmpty } from "lodash";
import { Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import useSWR from "swr";

import { envVarsToIconMap } from "@/components/playground/utils";
import { EnvVars } from "@/lib/env/utils";
import { ProviderApiKey } from "@/lib/settings/types";
import { formatTimestamp, swrFetcher } from "@/lib/utils";

import { Button } from "../ui/button";
import AddProviderApiKeyVarDialog from "./add-provider-api-key-dialog";
import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "./settings-section";

export default function ProviderApiKeys() {
  const { projectId } = useParams();
  const {
    data: providerApiKeys,
    mutate,
    isLoading,
  } = useSWR<ProviderApiKey[]>(`/api/projects/${projectId}/provider-api-keys`, swrFetcher);

  const postProviderApiKey = async (name: string, value: string) => {
    const res = await fetch(`/api/projects/${projectId}/provider-api-keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, value }),
    });

    if (res.ok) {
      mutate();
    }
  };

  const deleteProviderApiKey = async (name: string) => {
    const res = await fetch(`/api/projects/${projectId}/provider-api-keys?name=${name}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      mutate();
    }
  };

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Provider API keys"
        description="Set your model provider API keys for use in LLM calls. Variables are encrypted and stored securely."
      />
      <AddProviderApiKeyVarDialog
        existingKeyNames={providerApiKeys?.map((apiKey) => apiKey.name) ?? []}
        onAdd={(name, value) => {
          postProviderApiKey(name, value);
        }}
      />
      <SettingsTable isLoading={isLoading} isEmpty={isEmpty(providerApiKeys)} emptyMessage="No provider api keys found.">
        {providerApiKeys?.map((apiKey, index) => (
          <SettingsTableRow key={index}>
            <td className="px-4">
              <span className="flex gap-2 items-center text-sm font-medium">
                {envVarsToIconMap[apiKey.name as EnvVars]} {apiKey.name}
              </span>
            </td>
            <td className="px-4 text-sm text-muted-foreground">{formatTimestamp(apiKey.createdAt)}</td>
            <td className="px-4">
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    deleteProviderApiKey(apiKey.name);
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </td>
          </SettingsTableRow>
        ))}
      </SettingsTable>
    </SettingsSection>
  );
}
