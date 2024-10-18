'use client';

import { Label } from '@/components/ui/label';
import { useEffect, useState } from 'react';
import { useProjectContext } from '@/contexts/project-context';
import AddProviderApiKeyVarDialog from './add-provider-api-key-dialog';
import { Trash } from 'lucide-react';
import { swrFetcher } from '@/lib/utils';
import useSWR from 'swr';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { ProviderApiKey } from '@/lib/settings/types';

export default function ProviderApiKeys() {

  const { projectId } = useProjectContext();
  const {data: envVars, mutate} = useSWR<ProviderApiKey[]>(`/api/projects/${projectId}/provider-api-keys`, swrFetcher);

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

  if (!envVars) {
    return <Skeleton />;
  }

  return (
    <>
      <div className="flex flex-col items-start space-y-4 ">
        <h1 className="text-lg">Environment variables</h1>
        <Label className="">
          Set your environment variables to use in pipelines.
          Variables are encrypted and stored securely.
        </Label>
        <AddProviderApiKeyVarDialog
          existingKeyNames={envVars.map(apiKey => apiKey.name)}
          onAdd={(name, value) => {
            postProviderApiKey(name, value);
          }} />
        <table className="w-2/3 table-fixed border-t">
          <tbody>
            {
              envVars.map((apiKey, index) => (
                <tr key={index} className="border-b h-14">

                  <td className="">{apiKey.name}</td>
                  <td>
                    <div className="flex justify-end">
                      {/* TODO: replace with a dialog with warning */}
                      <Button
                        variant="secondary"
                        className="mr-4 text-gray-400"
                        onClick={() => {
                          deleteProviderApiKey(apiKey.name);
                        }}
                      >
                        <Trash className='w-4' />
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
