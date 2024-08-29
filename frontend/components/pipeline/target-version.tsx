import React, { useState } from 'react';

import { Button } from '@/components/ui/button'
import { useToast } from '../../lib/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Label } from '../ui/label';
import { Loader, Pencil, ShieldQuestion } from 'lucide-react';
import { PipelineVersionInfo } from '@/lib/pipeline/types';
import { useProjectContext } from '@/contexts/project-context';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';


interface SetTargetVersionButtonProps {
  pipelineId: string;
  pipelineVersionId: string;
  onTargetVersionChanged?: (targetVersionId: string) => void;
}

/**
 * Button which overrides the current workshop version (unsaved changes) with one of the commit's contents.
 */
export default function SetTargetVersionButton({ pipelineId, pipelineVersionId, onTargetVersionChanged: onPipelineVersionsChange }: SetTargetVersionButtonProps) {
  const router = useRouter();
  const pathName = usePathname();
  const { projectId } = useProjectContext()
  const { toast } = useToast();
  const searchParams = useSearchParams()

  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const overwriteWorkshopVersion = async () => {

    setIsLoading(true);

    let res = await fetch(
      `/api/projects/${projectId}/pipelines/${pipelineId}/target`,
      {
        method: 'POST',
        body: JSON.stringify({
          pipelineVersionId: pipelineVersionId,
        }),
        cache: 'no-cache',
      })

    if (res.status != 200) {
      toast({
        title: 'Error setting target pipeline version',
        variant: 'destructive'
      })

      setIsLoading(false);
      return
    }

    toast({
      title: 'Target pipeline version is set',
    })

    setIsLoading(false);
    setIsDialogOpen(false);

    // This method must redirect to workshop version
    onPipelineVersionsChange?.(pipelineVersionId);
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-7"
        >
          Set as target
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Set target pipeline version</DialogTitle>
        </DialogHeader>
        <div className="flex items-center space-x-2 mb-2">
          <Label>Are you sure you want to set this version as a target?</Label>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            handleEnter={true}
            onClick={overwriteWorkshopVersion}>
            {isLoading && <Loader className='animate-spin h-4 w-4 mr-2' />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog >
  );
}