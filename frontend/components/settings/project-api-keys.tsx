import { Copy, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { useProjectContext } from '@/contexts/project-context';
import {
  GenerateProjectApiKeyResponse,
  ProjectApiKey
} from '@/lib/api-keys/types';
import { useToast } from '@/lib/hooks/use-toast';

import { Button } from '../ui/button';
import CopyToClipboardButton from '../ui/copy-to-clipboard';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import RevokeDialog from './revoke-dialog';

interface ApiKeysProps {
  apiKeys: ProjectApiKey[];
}

export default function ProjectApiKeys({ apiKeys }: ApiKeysProps) {
  const [isGenerateKeyDialogOpen, setIsGenerateKeyDialogOpen] = useState(false);
  const [projectApiKeys, setProjectApiKeys] =
    useState<ProjectApiKey[]>(apiKeys);
  const [newApiKeyName, setNewApiKeyName] = useState<string>('');
  const [newApiKey, setNewApiKey] =
    useState<GenerateProjectApiKeyResponse | null>(null);
  const [isGenerated, setIsGenerated] = useState(false);
  const { projectId } = useProjectContext();

  const generateNewAPIKey = useCallback(async (newName: string) => {
    const res = await fetch(`/api/projects/${projectId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify({ name: newName })
    });
    const newKey = (await res.json()) as GenerateProjectApiKeyResponse;

    setNewApiKey(newKey);
  }, []);

  const deleteApiKey = useCallback(async (id: string) => {
    const res = await fetch(`/api/projects/${projectId}/api-keys`, {
      method: 'DELETE',
      body: JSON.stringify({ id: id })
    });
    await res.text();

    getProjectApiKeys();
  }, []);

  const getProjectApiKeys = async () => {
    const res = await fetch(`/api/projects/${projectId}/api-keys`, {
      method: 'GET'
    });
    const data = await res.json();
    setProjectApiKeys(data);
  };

  return (
    <>
      <div className="flex flex-col items-start space-y-4">
        <h1 className="text-lg">Project API keys</h1>
        <Label>
          Create a Laminar API key to make pipeline calls from your application.
          These keys are tied to the project.
        </Label>
        <Dialog
          open={isGenerateKeyDialogOpen}
          onOpenChange={() => {
            setIsGenerateKeyDialogOpen(!isGenerateKeyDialogOpen);
            setNewApiKeyName('');
            setNewApiKey(null);
            setIsGenerated(false);
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" className="h-8 max-w-80">
              <Plus className="w-4 mr-1 text-gray-500" />
              Generate API key
            </Button>
          </DialogTrigger>
          <DialogContent
            className="sm:max-w-[425px]"
            // prevent closing dialog when clicking outside when copying api key
            onInteractOutside={(e) =>
              isGenerated && newApiKey && e.preventDefault()
            }
          >
            <DialogHeader>
              <DialogTitle>
                {isGenerated && newApiKey
                  ? 'API key generated'
                  : 'Generate API key'}
              </DialogTitle>
            </DialogHeader>
            {isGenerated && newApiKey ? (
              <DisplayKeyDialogContent
                apiKey={newApiKey}
                onClose={() => {
                  setIsGenerateKeyDialogOpen(false);
                  getProjectApiKeys();
                }}
              />
            ) : (
              <GenerateKeyDialogContent
                onClick={() => {
                  generateNewAPIKey(newApiKeyName);
                  setIsGenerated(true);
                }}
                onNameChange={(name) => setNewApiKeyName(name)}
              />
            )}
          </DialogContent>
        </Dialog>
        <table className="w-1/2 border-t">
          <tbody>
            {projectApiKeys.map((apiKey, id) => (
              <tr className="border-b h-14" key={id}>
                <td className="">{apiKey.name}</td>
                <td className="ml-4 text-[16px] font-mono text-xs">
                  <div>{apiKey.shorthand}</div>
                </td>
                <td>
                  <div className="flex justify-end">
                    <RevokeDialog
                      apiKey={apiKey}
                      onRevoke={deleteApiKey}
                      entity="API key"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function GenerateKeyDialogContent({
  onClick,
  onNameChange
}: {
  onClick: () => void;
  onNameChange: (name: string) => void;
}) {
  return (
    <>
      <div className="grid gap-4 py-4">
        <Label>Name</Label>
        <Input
          autoFocus
          placeholder="API key name"
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button onClick={onClick} handleEnter>
          Create
        </Button>
      </DialogFooter>
    </>
  );
}

function DisplayKeyDialogContent({
  apiKey,
  onClose
}: {
  apiKey: GenerateProjectApiKeyResponse;
  onClose?: () => void;
}) {
  const { toast } = useToast();
  return (
    <>
      <div className="flex flex-col space-y-2">
        <p className="text-secondary-foreground">
          {' '}
          For security reasons, you will not be able to see this key again. Make
          sure to copy and save it somewhere safe.{' '}
        </p>
        <div className="flex space-x-2">
          <Input className="flex h-8 text-sm" value={apiKey.value} readOnly />
          <CopyToClipboardButton
            className="flex h-8"
            text={apiKey.value}
            toastPrefix="API key"
          >
            <Copy size={12} />
          </CopyToClipboardButton>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onClose} handleEnter variant="secondary">
          Close
        </Button>
      </DialogFooter>
    </>
  );
}
