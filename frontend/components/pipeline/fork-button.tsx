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
import { Loader, GitFork } from 'lucide-react';
import { PipelineVersionInfo } from '@/lib/pipeline/types';
import { useRouter } from 'next/navigation';
import { useProjectContext } from '@/contexts/project-context';


interface ForkButtonProps {
  defaultNewPipelineName: string
  selectedPipelineVersion: PipelineVersionInfo
}


/**
 * Fork button which forks pipeline version into a newly created pipeline inside selected project.
 */
export default function ForkButton({ defaultNewPipelineName, selectedPipelineVersion }: ForkButtonProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { projectId } = useProjectContext();

  const [newPipelineName, setNewPipelineName] = useState<string>(defaultNewPipelineName);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const forkPipelineVersion = async () => {

    setIsLoading(true);

    let res = await fetch(
      `/api/projects/${projectId}/pipeline-versions`,
      {
        method: 'POST',
        body: JSON.stringify({
          refVersionId: selectedPipelineVersion.id,
          newPipelineName,
        }),
        cache: 'no-cache',
      })

    if (res.status != 200) {
      toast({
        title: 'Error forking version',
        variant: 'destructive'
      })

      setIsLoading(false);
      setIsOpen(false);
      return
    }

    let res_body = await res.json();

    toast({
      title: 'Successfully forked version'
    })

    setIsLoading(false);
    setIsOpen(false);

    router.push(`/project/${projectId}/pipelines/${res_body.pipelineId}`);
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
    }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-7"
        >
          <GitFork className="h-4 w-4 mr-2" />
          Clone
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Fork version</DialogTitle>
        </DialogHeader>
        <Label className='mb-4'>Fork to newly created pipeline inside this project</Label>

        <Label>New pipeline name</Label>
        <Input
          autoFocus
          placeholder='Enter new pipeline name'
          defaultValue={newPipelineName}
          value={newPipelineName}
          onChange={(e) =>
            setNewPipelineName(e.target.value)
          }
        />
        <DialogFooter>
          <Button
            disabled={!newPipelineName || isLoading}
            handleEnter={true}
            onClick={forkPipelineVersion}>
            {isLoading && <Loader className='animate-spin h-4 w-4 mr-2' />}
            Fork
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}