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
import { Input } from '../ui/input';
import { Loader, PlusCircle } from 'lucide-react';
import { PipelineVersionInfo } from '@/lib/pipeline/types';
import { useProjectContext } from '@/contexts/project-context';
import useStore from '@/lib/flow/store';
import { GRAPH_VALID, validateGraph } from '@/lib/pipeline/utils';


interface CommitButtonProps {
  selectedPipelineVersion: PipelineVersionInfo
  onPipelineVersionsChange: () => void
}


/**
 * Commit button which creates a commit - an immutable clone of current version.
 */
export default function CommitButton({ selectedPipelineVersion, onPipelineVersionsChange }: CommitButtonProps) {
  const { projectId } = useProjectContext()
  const { toast } = useToast();
  const { getGraph, getEdges } = useStore();

  const [commitVersionName, setCommitVersionName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const commitPipelineVersion = async () => {

    setIsLoading(true);

    const validationRes = validateGraph(getGraph(), getEdges());
    if (validationRes !== GRAPH_VALID) {
      toast({
        title: 'Only valid graphs can be committed',
        variant: 'destructive',
        description: validationRes,
        duration: 10000
      })

      setIsLoading(false);
      return
    }

    let res = await fetch(
      `/api/projects/${projectId}/pipelines/${selectedPipelineVersion.pipelineId}/versions/`,
      {
        method: 'POST',
        body: JSON.stringify({
          refVersionId: selectedPipelineVersion.id,
          newPipelineName: commitVersionName,
          newPipelineType: 'COMMIT',
        }),
        cache: 'no-cache',
      })

    if (res.status != 200) {
      toast({
        title: 'Error committing version',
        variant: 'destructive'
      })

      setIsLoading(false);
      return
    }

    toast({
      title: 'Successfully committed version'
    })

    setIsLoading(false);
    setIsDialogOpen(false);
    onPipelineVersionsChange();
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={(open) => {
      setIsDialogOpen(open);
      setCommitVersionName('');
    }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-7 text-purple-400"
        >
          <PlusCircle className='h-4' />
          Commit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Commit version</DialogTitle>
        </DialogHeader>
        <Label className='mb-8'>Save immutable copy of pipeline in history</Label>
        <Label>Commit version name</Label>
        <Input
          autoFocus
          placeholder='Enter commit version name'
          value={commitVersionName}
          onChange={(e) =>
            setCommitVersionName(e.target.value)
          }
        />
        <DialogFooter>
          <Button
            disabled={!commitVersionName || isLoading}
            handleEnter={true}
            onClick={commitPipelineVersion}>
            {isLoading && <Loader className='animate-spin h-4 w-4 mr-2' />}
            Commit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}