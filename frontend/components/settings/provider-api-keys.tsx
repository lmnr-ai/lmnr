'use client';

import { Label } from '@/components/ui/label';
import { useEffect, useState } from 'react';
import { useProjectContext } from '@/contexts/project-context';
import AddProviderApiKeyVarDialog from './add-provider-api-key-dialog';
import { Trash, Trash2 } from 'lucide-react';
import { formatTimestamp, swrFetcher } from '@/lib/utils';
import useSWR from 'swr';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { ProviderApiKey } from '@/lib/settings/types';

export default function ProviderApiKeys() {

  const { projectId } = useProjectContext();
  const { data: providerApiKeys, mutate } = useSWR<ProviderApiKey[]>(`/api/projects/${projectId}/provider-api-keys`, swrFetcher);

  const postProviderApiKey = async (name: string, value: string) => {
    const res = await fetch(`/api/projects/${projectId}/provider-api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, value }),
    });

    if (res.ok) {
      mutate();
    }
  };

  const deleteProviderApiKey = async (name: string) => {
    const res = await fetch(`/api/projects/${projectId}/provider-api-keys?name=${name}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) {
      mutate();
    }
  };

  return (
    <>
      <div className="flex flex-col items-start space-y-4 ">
        <h1 className="text-lg">Model provider API keys</h1>
        <Label className="">
          Set your model provider API keys for use in LLM calls.
          Variables are encrypted and stored securely.
        </Label>
        <AddProviderApiKeyVarDialog
          existingKeyNames={providerApiKeys?.map(apiKey => apiKey.name) ?? []}
          onAdd={(name, value) => {
            postProviderApiKey(name, value);
          }} />
        <table className="w-1/2 table-fixed border-t">
          <tbody>
            {
              providerApiKeys?.map((apiKey, index) => (
                <tr key={index} className="border-b h-14">
                  <td className="">{apiKey.name}</td>
                  <td className="">
                    {formatTimestamp(apiKey.createdAt)}
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        className=""
                        onClick={() => {
                          deleteProviderApiKey(apiKey.name);
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </>
  );
}
