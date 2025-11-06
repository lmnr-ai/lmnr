import { isEmpty } from "lodash";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { GenerateProjectApiKeyResponse, ProjectApiKey } from "@/lib/api-keys/types";
import { useToast } from "@/lib/hooks/use-toast";

import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import RevokeDialog from "../revoke-dialog";
import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "../settings-section";
import { DisplayKeyDialogContent } from "./display-key-dialog-content";
import { GenerateKeyDialogContent } from "./generate-key-dialog-content";

interface ApiKeysProps {
  apiKeys: ProjectApiKey[];
}

export default function ProjectApiKeys({ apiKeys }: ApiKeysProps) {
  const [isGenerateKeyDialogOpen, setIsGenerateKeyDialogOpen] = useState(false);
  const [projectApiKeys, setProjectApiKeys] = useState<ProjectApiKey[]>(apiKeys);
  const [newApiKeyName, setNewApiKeyName] = useState<string>("");
  const [keyType, setKeyType] = useState<"default" | "ingest_only">("default");
  const [newApiKey, setNewApiKey] = useState<GenerateProjectApiKeyResponse | null>(null);
  const [isGenerated, setIsGenerated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { projectId } = useParams();

  const generateNewAPIKey = useCallback(
    async (newName: string, isIngestOnly: boolean) => {
      const res = await fetch(`/api/projects/${projectId}/api-keys`, {
        method: "POST",
        body: JSON.stringify({ name: newName, isIngestOnly }),
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

  const handleGenerateKey = useCallback(async () => {
    try {
      setIsLoading(true);
      await generateNewAPIKey(newApiKeyName, keyType === "ingest_only");
      setIsGenerated(true);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to generate API key" });
    } finally {
      setIsLoading(false);
    }
  }, [newApiKeyName, keyType, generateNewAPIKey, toast, projectId]);

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
          setKeyType("default");
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
              onClick={handleGenerateKey}
              isLoading={isLoading}
              onNameChange={(name) => setNewApiKeyName(name)}
              keyType={keyType}
              onKeyTypeChange={(type) => setKeyType(type)}
            />
          )}
        </DialogContent>
      </Dialog>
      <SettingsTable emptyMessage="No project api keys found." isEmpty={isEmpty(projectApiKeys)}>
        {projectApiKeys.map((apiKey, id) => (
          <SettingsTableRow key={id}>
            <td className="px-4 text-sm font-medium">{apiKey.name}</td>
            <td className="px-4 text-sm font-mono text-muted-foreground">{apiKey.shorthand}</td>
            <td className="px-4">
              {apiKey.isIngestOnly && (
                <Badge variant="outline">Ingest Only</Badge>
              )}
            </td>
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
