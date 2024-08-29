import { ProjectApiKey } from "@/lib/api-keys/types"
import { Button } from "../ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Copy, Plus } from "lucide-react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { useCallback, useState } from "react";
import { useProjectContext } from "@/contexts/project-context";
import { useToast } from "@/lib/hooks/use-toast";
import DeleteProject from "./delete-project";
import RevokeDialog from "./revoke-dialog";

interface ApiKeysProps {
  apiKeys: ProjectApiKey[]
}

export default function ProjectApiKeys({ apiKeys }: ApiKeysProps) {

  const [isGenerateKeyDialogOpen, setIsGenerateKeyDialogOpen] = useState(false);
  const [projectApiKeys, setProjectApiKeys] = useState<ProjectApiKey[]>(apiKeys)
  const [newApiKeyName, setNewApiKeyName] = useState<string>('')
  const { projectId } = useProjectContext()
  const { toast } = useToast();

  const generateNewAPIKey = useCallback(async (newName: string) => {
    const res = await fetch(`/api/projects/${projectId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify({ name: newName })
    });
    await res.json()

    getProjectApiKeys()
  }, [])

  const deleteApiKey = useCallback(async (apiKeyVal: string) => {
    const res = await fetch(`/api/projects/${projectId}/api-keys`, {
      method: 'DELETE',
      body: JSON.stringify({ apiKey: apiKeyVal })
    });
    await res.text()

    getProjectApiKeys()
  }, [])

  const getProjectApiKeys = async () => {
    const res = await fetch(`/api/projects/${projectId}/api-keys`, {
      method: 'GET'
    });
    const data = await res.json()
    setProjectApiKeys(data)
  }

  return (
    <>
      <div className="flex flex-col items-start space-y-4">
        <h1 className="text-lg">Project API keys</h1>
        <Label>
          Create a Laminar API key to make pipeline calls from your application.
          These keys are tied to the project.
        </Label>
        <Dialog open={isGenerateKeyDialogOpen} onOpenChange={() => {
          setIsGenerateKeyDialogOpen(!isGenerateKeyDialogOpen);
          setNewApiKeyName('');
        }}>
          <DialogTrigger asChild>
            <Button variant="outline" className="h-8 max-w-80">
              <Plus className='w-4 mr-1 text-gray-500' />
              Generate API key
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Generate API key</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Label>Name</Label>
              <Input
                autoFocus
                placeholder="API key name"
                onChange={(e) => setNewApiKeyName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  setIsGenerateKeyDialogOpen(false);
                  generateNewAPIKey(newApiKeyName)
                }}
                handleEnter>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <table className="w-1/2 border-t">
          <tbody>
            {
              projectApiKeys.map((apiKey, id) => (
                <tr className="border-b h-14" key={id}>
                  <td className="">{apiKey.name}</td>
                  <td className="ml-4 text-[16px] font-mono text-xs">
                    <div>{apiKey.value.slice(0, 4)} ... {apiKey.value.slice(-4)}</div>
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <button
                        className="mr-4 text-gray-400"
                        onClick={() => {
                          // copy api key to clipboard
                          navigator.clipboard.writeText(apiKey.value)
                          toast({
                            title: 'API key copied to clipboard'
                          })
                        }}
                      >
                        <Copy className="h-4" />
                      </button>
                      <RevokeDialog obj={apiKey} onRevoke={deleteApiKey} entity="API key" />
                    </div>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </>
  )
}
