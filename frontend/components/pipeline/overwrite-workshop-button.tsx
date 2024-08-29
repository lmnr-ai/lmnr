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


interface OverwriteWorkshopButtonProps {
  workshopVersionId: string;
  selectedPipelineVersion: PipelineVersionInfo;
  onPipelineVersionsChange: () => void;
}


/**
 * Button which overrides the current workshop version (unsaved changes) with one of the commit's contents.
 */
export default function OverwriteWorkshopButton({ workshopVersionId, selectedPipelineVersion, onPipelineVersionsChange }: OverwriteWorkshopButtonProps) {
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
      `/api/projects/${projectId}/pipelines/${selectedPipelineVersion.pipelineId}/versions/${workshopVersionId}/overwrite`,
      {
        method: 'POST',
        body: JSON.stringify({
          refVersionId: selectedPipelineVersion.id,
        }),
        cache: 'no-cache',
      })

    if (res.status != 200) {
      toast({
        title: 'Error overwriting workshop version',
        variant: 'destructive'
      })

      setIsLoading(false);
      return
    }

    toast({
      title: 'Workshop version is overwritten'
    })

    setIsLoading(false);
    setIsDialogOpen(false);

    // This method must redirect to workshop version
    onPipelineVersionsChange();
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-7"
        >
          Overwrite workshop
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Continue overwriting</DialogTitle>
        </DialogHeader>
        <div className="flex items-center space-x-2 mb-2">
          <Label>Overwrite workshop version?</Label>
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
            Overwrite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog >
  );
}