"use client";

import { Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import useSWR from "swr";

import { envVarsToIconMap } from "@/components/playground/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EnvVars } from "@/lib/env/utils";
import { ProviderApiKey } from "@/lib/settings/types";
import { formatTimestamp, swrFetcher } from "@/lib/utils";

import { Button } from "../ui/button";
import AddProviderApiKeyVarDialog from "./add-provider-api-key-dialog";

export default function ProviderApiKeys() {
  const { projectId } = useParams();
  const { data: providerApiKeys, mutate, isLoading } = useSWR<ProviderApiKey[]>(
    `/api/projects/${projectId}/provider-api-keys`,
    swrFetcher
  );

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
    <div className="rounded-lg border bg-background">
      <div className="p-6 space-y-4">
        <div className="space-y-2">
          <h3 className="text-base font-semibold">Model provider API keys</h3>
          <p className="text-sm text-muted-foreground">
            Set your model provider API keys for use in LLM calls. Variables are encrypted and stored securely.
          </p>
        </div>
        <AddProviderApiKeyVarDialog
          existingKeyNames={providerApiKeys?.map((apiKey) => apiKey.name) ?? []}
          onAdd={(name, value) => {
            postProviderApiKey(name, value);
          }}
        />
        {isLoading ? (
          <div className="border rounded-md p-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="border rounded-md">
            <table className="w-full">
              <tbody>
                {providerApiKeys?.map((apiKey, index) => (
                  <tr key={index} className="border-b last:border-b-0 h-12">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
