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
import { useEffect, useState } from 'react';
import { useProjectContext } from '@/contexts/project-context';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TemplateInfo } from '@/lib/pipeline/types';
import { Skeleton } from '../ui/skeleton';
import TemplateSelect from './template-select';
import { useToast } from '@/lib/hooks/use-toast';

interface CreatePipelineDialogProps {
  onUpdate?: () => void;
}

export function CreatePipelineDialog({ onUpdate }: CreatePipelineDialogProps) {
  const [pipelineName, setPipelineName] = useState<string>('');
  const { projectId } = useProjectContext();
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<
    string | undefined
  >(undefined);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);

  const createNewPipeline = async () => {
    // Allow to click "Create" with an empty pipeline name. Otherwise, if the button is simply disabled,
    // then it's hard to understand that name is required.
    if (!pipelineName) {
      toast({
        title: 'Set the pipeline name',
        description: 'Pipelines need a name to be created',
        variant: 'default'
      });
      return;
    }

    setIsLoading(true);

    const res = await fetch(`/api/projects/${projectId}/pipelines/`, {
      method: 'POST',
      body: JSON.stringify({
        name: pipelineName,
        projectId,
        visibility: 'PRIVATE',
        templateId: selectedTemplateId
      })
    });

    if (res.status !== 200) {
      // Just a generic error message, since most likely the error has happened because the pipeline with the same name already exists.
      toast({
        title: 'Error creating pipeline',
        description: 'Pipeline name must be unique in the project',
        variant: 'destructive'
      });
      setIsLoading(false);
      return;
    }

    const json = await res.json();
    onUpdate?.();
    setIsDialogOpen(false);
    router.push(`/project/${projectId}/pipelines/${json.id}`);

    // Must come after router.push, otherwise multiple enter presses will create multiple pipelines
    setIsLoading(false);
  };

  useEffect(() => {
    const fetchTemplates = async () => {
      const res = await fetch(`/api/projects/${projectId}/templates`);
      const json = (await res.json()) as TemplateInfo[];
      setTemplates(json);
      if (json.length > 0) {
        setSelectedTemplateId(json[0].id);
      }
    };
    fetchTemplates();
  }, []);

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setIsDialogOpen(open);
        setPipelineName('');
        if (!open) {
          if (templates.length > 0) {
            setSelectedTemplateId(templates[0].id);
          } else {
            setSelectedTemplateId(undefined);
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="default">New pipeline</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] min-w-[800px]">
        <DialogHeader>
          <DialogTitle>Create new pipeline</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col">
          <Label>Name</Label>
          <Input
            className="mt-2"
            autoFocus
            placeholder="Name"
            onChange={(e) => setPipelineName(e.target.value)}
          />
          {templates.length === 0 ? (
            <Skeleton className="h-10 mt-2" />
          ) : (
            <TemplateSelect
              className="mt-4"
              templateId={selectedTemplateId ?? ''}
              setTemplateId={setSelectedTemplateId}
              templates={templates}
            />
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={createNewPipeline}
            handleEnter={true}
            disabled={selectedTemplateId === undefined || isLoading}
          >
            <Loader2
              className={cn(
                'mr-2 hidden',
                isLoading ? 'animate-spin block' : ''
              )}
              size={16}
            />
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
