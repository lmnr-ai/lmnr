'use client';

import { Edit,Loader2 } from 'lucide-react';
import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { useProjectContext } from '@/contexts/project-context';
import { cn } from '@/lib/utils';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface RenameProjectProps {}

export default function RenameProject({}: RenameProjectProps) {
  const { projectId, projectName } = useProjectContext();

  const [newProjectName, setNewProjectName] = useState<string>('');
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const renameProject = async () => {
    setIsLoading(true);

    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: newProjectName,
      }),
    });

    if (res.ok) {
      // Reload the page to reflect the updated name
      window.location.reload();
    } else {
      // Handle error (e.g., show toast or error message)
      console.error('Failed to rename project');
    }

    setIsLoading(false);
  };

  return (
    <div>
      <div className="flex flex-col items-start space-y-4">
        <h1 className="text-lg">Rename project</h1>
        <Label className="text-sm text-secondary-foreground">
          Update the name of your project. Changes will take effect immediately.
        </Label>
        <Dialog
          open={isRenameDialogOpen}
          onOpenChange={() => {
            setIsRenameDialogOpen(!isRenameDialogOpen);
            setNewProjectName('');
          }}
        >
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setIsRenameDialogOpen(true);
              }}
              variant="outline"
              className="h-8 max-w-80"
            >
              <Edit className="w-4 mr-1" />
              Rename project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Rename project</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Label>Enter new project name</Label>
              <Input
                autoFocus
                placeholder={projectName}
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                disabled={!newProjectName.trim() || isLoading}
                onClick={renameProject}
                handleEnter={true}
              >
                <Loader2
                  className={cn(
                    'mr-2 hidden',
                    isLoading ? 'animate-spin block' : ''
                  )}
                  size={16}
                />
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
