import { Workspace } from "@/lib/workspaces/types"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from "../ui/button";
import { Loader, Plus } from "lucide-react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { swrFetcher } from "@/lib/utils";
import useSWR from "swr";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { UserStats } from "@/lib/profile/types";

interface WorkspaceCreateDialogProps {
  onWorkspaceCreate?: () => void
}

export default function WorkspaceCreateDialog({ onWorkspaceCreate }: WorkspaceCreateDialogProps) {
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const { data: userStats } = useSWR<UserStats>('/api/limits/user', swrFetcher);
  const canCreateWorkspace = userStats?.numWorkspaces != null
    ? (userStats?.workspacesLimit < 0 ? true : userStats.numWorkspaces < userStats?.workspacesLimit)
    : false;

  const router = useRouter();

  const createNewWorkspace = async () => {
    setIsCreatingWorkspace(true);
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({
        name: newWorkspaceName,
      })
    });

    const newWorkspace = await res.json() as Workspace;

    onWorkspaceCreate?.();
    router.push(`/workspace/${newWorkspace.id}`);
    setIsCreatingWorkspace(false);
  }

  return canCreateWorkspace
    ?
    (
      <Dialog>
        <DialogTrigger asChild>
          <div tabIndex={0}>
            <Button variant="outline">
              <Plus size={16} className='mr-1' />
              New workspace
            </Button>
          </div>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label>Name</Label>
            <Input
              autoFocus
              placeholder="Name"
              onChange={(e) => setNewWorkspaceName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={createNewWorkspace} handleEnter={true} disabled={!newWorkspaceName}>
              {isCreatingWorkspace && <Loader className='mr-2 animate-spin' size={16} />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
    :
    (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div tabIndex={0}>
              <Button variant="outline" disabled>
                <Plus size={16} className='mr-1' />
                New workspace
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="mt-2 bg-secondary border">
            You have reached the limit of workspaces you can create.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
}
