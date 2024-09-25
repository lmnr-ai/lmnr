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
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectContext } from '@/contexts/project-context';
import { EventTemplate, EventType } from '@/lib/events/types';

interface DeleteEventTemplateProps {
  defaultEventTemplate: EventTemplate;
}

export default function DeleteEventTemplateDialog({
  defaultEventTemplate,
}: DeleteEventTemplateProps) {
  const { projectId } = useProjectContext();
  const router = useRouter();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const deleteEventTemplate = async () => {
    setIsLoading(true);

    const res = await fetch(`/api/projects/${projectId}/event-templates/${defaultEventTemplate.id}`, {
      method: 'DELETE',
    });

    await res.text();

    setIsLoading(false);
    setIsDialogOpen(false);
    router.push(`/project/${projectId}/event-templates`);
    router.refresh();
  }


  return (
    <>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary">
            Delete
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete event {defaultEventTemplate.name}</DialogTitle>
          </DialogHeader>
          <Label className='text-secondary-foreground'>
            Are you sure you want to delete this event template? This will remove all events associated with this template.
          </Label>
          <DialogFooter>
            <Button
              variant="default"
              onClick={deleteEventTemplate}
              disabled={isLoading}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
