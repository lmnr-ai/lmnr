import { WorkspaceWithProjects } from '@/lib/workspaces/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '../ui/button';
import { Loader2, Plus } from 'lucide-react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';

interface WorkspaceCreateDialogProps {
  onWorkspaceCreate?: () => void;
}

export default function WorkspaceCreateDialog({
  onWorkspaceCreate
}: WorkspaceCreateDialogProps) {
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const router = useRouter();

  const createNewWorkspace = async () => {
    setIsCreatingWorkspace(true);
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({
        name: newWorkspaceName
      })
    });

    const newWorkspace = (await res.json()) as WorkspaceWithProjects;

    onWorkspaceCreate?.();
    router.push(`/workspace/${newWorkspace.id}`);
    setIsCreatingWorkspace(false);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div tabIndex={0}>
          <Button variant="outline">
            <Plus size={16} className="mr-1" />
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
          <Button
            onClick={createNewWorkspace}
            handleEnter={true}
            disabled={!newWorkspaceName || isCreatingWorkspace}
          >
            {isCreatingWorkspace && (
              <Loader2 className="mr-2 animate-spin" size={16} />
            )}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
