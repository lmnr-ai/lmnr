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
import { Loader, Trash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectContext } from '@/contexts/project-context';
import DefaultTextarea from '../ui/default-textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { EventTemplate, EventType } from '@/lib/events/types';
import { Switch } from '../ui/switch';

interface EditEventTemplateProps {
  defaultEventTemplate: EventTemplate;
}

export default function EditEventTemplateDialog({
  defaultEventTemplate,
}: EditEventTemplateProps) {
  const { projectId } = useProjectContext();
  const router = useRouter();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const name = defaultEventTemplate.name;
  const [description, setDescription] = useState<string>(defaultEventTemplate.description ?? '');
  const [instruction, setInstruction] = useState<string>(defaultEventTemplate.instruction ?? '');
  const [eventType, setEventType] = useState<EventType | null>(defaultEventTemplate.eventType);


  const updateEvent = async () => {
    setIsLoading(true);

    const res = await fetch(`/api/projects/${projectId}/event-templates/${defaultEventTemplate.id}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: description.length > 0 ? description : null,
        instruction: instruction.length > 0 ? instruction : null,
        eventType,
      }),
    });

    const data = await res.json();

    setIsLoading(false);
    setIsDialogOpen(false);
    setDescription(data.description ?? '');
    setInstruction(data.instruction ?? '');
    setEventType(data.eventType);
    router.refresh();
  }

  const isReady = () => eventType && name.length > 0;

  return (
    <>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary">
            Edit
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit event</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label>Name</Label>
            <Input
              placeholder="Name"
              disabled
              value={name}
            />
            <Label>Description (optional)</Label>
            <DefaultTextarea
              autoFocus
              value={description}
              placeholder='Description of an event'
              onChange={(e) => setDescription(e.target.value)}
            />
            <Label>Instruction (optional)</Label>
            <DefaultTextarea
              value={instruction}
              placeholder='Instruction for the model to evaluate event...'
              onChange={(e) => setInstruction(e.target.value)}
            />
            <Label>Event type</Label>
            <Select
              defaultValue={eventType?.toString()}
              onValueChange={(value) => {
                setEventType(value as EventType);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="boolean" value={EventType.BOOLEAN}>Boolean</SelectItem>
                <SelectItem key="string" value={EventType.STRING}>String</SelectItem>
                <SelectItem key="number" value={EventType.NUMBER}>Number</SelectItem>
              </SelectContent>
            </Select>

          </div>
          <DialogFooter>
            <Button
              onClick={updateEvent}
              disabled={isLoading || !isReady()}
            >
              <Loader className={cn('mr-2 hidden', isLoading ? 'animate-spin block' : '')} size={16} />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
