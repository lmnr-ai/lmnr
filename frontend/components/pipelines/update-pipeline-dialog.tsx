'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { useProjectContext } from '@/contexts/project-context';
import { Loader, Pencil, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pipeline } from '@/lib/pipeline/types';
import { DropdownMenuItem } from '../ui/dropdown-menu';

interface UpdatePipelineDialogProps {
  oldPipeline: Pipeline;
  onUpdate?: () => void;
  isDropdown?: boolean;
}

export function UpdatePipelineDialog({ oldPipeline, onUpdate, isDropdown = true }: UpdatePipelineDialogProps) {

  const [pipeline, setPipeline] = useState<Pipeline>(oldPipeline);
  const { projectId } = useProjectContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  const createNewPipeline = async () => {
    setIsLoading(true);

    const res = await fetch(`/api/projects/${projectId}/pipelines/${oldPipeline.id!}`, {
      method: 'POST',
      body: JSON.stringify({
        ...pipeline,
        projectId,
      }),
    });
    const json = await res.json();
    onUpdate?.();
    setIsLoading(false);
    setIsDialogOpen(false);
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          {isDropdown ? (
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}> Edit </DropdownMenuItem>
          ) : (
            <div className='h-full align-middle'>
              <Button variant='outline' className='my-auto'>
                <Pencil size={16} /> Edit
              </Button>
            </div>
          )}
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit pipeline {oldPipeline.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label>Name</Label>
            <Input
              defaultValue={oldPipeline.name}
              autoFocus
              placeholder="Name"
              onChange={(e) => setPipeline((prev: Pipeline) => ({ ...prev, name: e.target.value } as Pipeline))}
            />
          </div>
          <DialogFooter>
            <Button onClick={createNewPipeline} disabled={!pipeline.name || isLoading} handleEnter>
              <Loader className={cn('mr-2 hidden', isLoading ? 'animate-spin block' : '')} size={16} />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
