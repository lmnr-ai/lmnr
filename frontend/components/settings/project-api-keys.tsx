import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { GenerateProjectApiKeyResponse, ProjectApiKey } from "@/lib/api-keys/types";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import RevokeDialog from "./revoke-dialog";
import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "./settings-section";

interface ApiKeysProps {
  apiKeys: ProjectApiKey[];
}

export default function ProjectApiKeys({ apiKeys }: ApiKeysProps) {
  const [isGenerateKeyDialogOpen, setIsGenerateKeyDialogOpen] = useState(false);
  const [projectApiKeys, setProjectApiKeys] = useState<ProjectApiKey[]>(apiKeys);
  const [newApiKeyName, setNewApiKeyName] = useState<string>("");
  const [newApiKey, setNewApiKey] = useState<GenerateProjectApiKeyResponse | null>(null);
  const [isGenerated, setIsGenerated] = useState(false);
  const { projectId } = useParams();

  const generateNewAPIKey = useCallback(
    async (newName: string) => {
      const res = await fetch(`/api/projects/${projectId}/api-keys`, {
        method: "POST",
        body: JSON.stringify({ name: newName }),
      });
      const newKey = (await res.json()) as GenerateProjectApiKeyResponse;

      setNewApiKey(newKey);
    },
    [projectId]
  );

  const getProjectApiKeys = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/api-keys`, {
      method: "GET",
    });
    const data = await res.json();
    setProjectApiKeys(data);
  }, [projectId]);

  const deleteApiKey = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/projects/${projectId}/api-keys`, {
        method: "DELETE",
        body: JSON.stringify({ id: id }),
      });
      await res.text();

      getProjectApiKeys();
    },
    [projectId, getProjectApiKeys]
  );

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Project API keys"
        description="Create a Laminar API key to send traces from your AI application. These keys are tied to the project."
      />
      <Dialog
        open={isGenerateKeyDialogOpen}
        onOpenChange={() => {
          setIsGenerateKeyDialogOpen(!isGenerateKeyDialogOpen);
          setNewApiKeyName("");
          setNewApiKey(null);
          setIsGenerated(false);
        }}
      >
        <DialogTrigger asChild>
          <Button icon="plus" variant="outline" className="w-fit">
            API Key
          </Button>
        </DialogTrigger>
        <DialogContent
          className="sm:max-w-[425px]"
          // prevent closing dialog when clicking outside when copying api key
          onInteractOutside={(e) => isGenerated && newApiKey && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{isGenerated && newApiKey ? "API key generated" : "Generate API key"}</DialogTitle>
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
      <SettingsTable>
        {projectApiKeys.map((apiKey, id) => (
          <SettingsTableRow key={id}>
            <td className="px-4 text-sm font-medium">{apiKey.name}</td>
            <td className="px-4 text-sm font-mono text-muted-foreground">{apiKey.shorthand}</td>
            <td className="px-4">
              <div className="flex justify-end">
                <RevokeDialog apiKey={apiKey} onRevoke={deleteApiKey} entity="API key" />
              </div>
            </td>
          </SettingsTableRow>
        ))}
      </SettingsTable>
    </SettingsSection>
  );
}

function GenerateKeyDialogContent({
  onClick,
  onNameChange,
}: {
  onClick: () => void;
  onNameChange: (name: string) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label className="text-xs">Name</Label>
        <Input autoFocus placeholder="API key name" onChange={(e) => onNameChange(e.target.value)} />
      </div>
      <DialogFooter>
        <Button onClick={onClick} handleEnter>
          Create
        </Button>
      </DialogFooter>
    </>
  );
}

function DisplayKeyDialogContent({ apiKey, onClose }: { apiKey: GenerateProjectApiKeyResponse; onClose?: () => void }) {
  return (
    <>
      <div className="flex flex-col space-y-2">
        <p className="text-secondary-foreground">
          {" "}
          For security reasons, you will not be able to see this key again. Make sure to copy and save it somewhere
          safe.{" "}
        </p>
        <div className="flex gap-x-2">
          <Input className="flex h-8 text-sm" value={apiKey.value} readOnly />
          <CopyButton size="icon" className="min-w-8 h-8" text={apiKey.value} />
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
