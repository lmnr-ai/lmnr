'use client';

import { Loader2, Pencil } from 'lucide-react';
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

  const [inputProjectName, setInputProjectName] = useState<string>('');
  const [isRenameProjectDialogOpen, setIsRenameProjectDialogOpen] =
    useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const renameProject = async () => {
    setIsLoading(true);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({
        name: inputProjectName
      })
    });
    window.location.reload();
  };

  return (
    <div>
      <div className="flex flex-col items-start space-y-4">
        <h1 className="text-lg">Rename project</h1>
        <Label className="text-sm text-secondary-foreground">
          Rename the project.
        </Label>
        <Dialog
          open={isRenameProjectDialogOpen}
          onOpenChange={() => {
            setIsRenameProjectDialogOpen(!isRenameProjectDialogOpen);
            setInputProjectName(projectName);
          }}
        >
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setIsRenameProjectDialogOpen(true);
              }}
              variant="outline"
              className="h-8 max-w-80"
            >
              <Pencil className="w-4 mr-1" />
              Rename project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Rename project</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Label>Enter project name</Label>
              <Input
                autoFocus
                value={inputProjectName}
                onChange={(e) => setInputProjectName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                disabled={inputProjectName === projectName || isLoading}
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
