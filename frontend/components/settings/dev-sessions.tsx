import { useProjectContext } from "@/contexts/project-context";
import { Label } from "../ui/label";
import { getLocalDevSessions } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Button } from "../ui/button";
import { Copy, Plus } from "lucide-react";
import { Input } from "../ui/input";
import { v4 as uuidv4 } from "uuid";
import { useToast } from "@/lib/hooks/use-toast";
import RevokeDialog from "./revoke-dialog";

export default function DevSessions() {
  const { projectId } = useProjectContext();
  const [sessions, setSessions] = useState<Record<string, string>>(getLocalDevSessions(projectId));
  const [isGenerateSessionDialogOpen, setIsGenerateSessionDialogOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    localStorage.setItem(`dev-sessions-${projectId}`, JSON.stringify(sessions));
  }, [sessions]);

  return (
    <div className="flex flex-col items-start space-y-4">
      <h1 className="text-lg">Dev sessions</h1>
      <Label>
        Generate a new dev session to use in your local development environment.
        Session IDs are stored in your browser and are not visible to others in this project.
      </Label>
      <Dialog open={isGenerateSessionDialogOpen} onOpenChange={() => {
        setIsGenerateSessionDialogOpen(!isGenerateSessionDialogOpen);
        setNewSessionName('');
      }}>
        <DialogTrigger asChild>
          <Button variant="outline" className="h-8 max-w-80">
            <Plus className='w-4 mr-1 text-gray-500' />
            Generate session ID
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Generate session ID</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label>Name</Label>
            <Input
              autoFocus
              placeholder="Session name"
              onChange={(e) => setNewSessionName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={!newSessionName}
              onClick={() => {
                setIsGenerateSessionDialogOpen(false);
                const newSessions = { ...sessions, [newSessionName]: uuidv4() };
                setSessions(newSessions);
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
            Object.entries(sessions).map(([sessionName, sessionId], index) => (
              <tr className="border-b h-14" key={index}>
                <td className="">{sessionName}</td>
                <td className="ml-4 text-[16px] font-mono text-xs">
                  {sessionId}
                </td>
                <td>
                  <div className="flex justify-end">
                    <button
                      className="mr-4 text-gray-400"
                      onClick={() => {
                        // copy api key to clipboard
                        navigator.clipboard.writeText(sessionId)
                        toast({
                          title: 'Session ID copied to clipboard'
                        })
                      }}
                    >
                      <Copy className="h-4" />
                    </button>
                    <RevokeDialog obj={{ name: sessionName, value: sessionId }} entity="session" onRevoke={async () => {
                      const newSessions = Object.fromEntries(Object.entries({ ...sessions }).filter(([key, _]) => key !== sessionName));
                      setSessions(newSessions);
                    }} />
                  </div>
                </td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  )
}
