'use client';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProjectContext } from '@/contexts/project-context';
import { EventTemplate, EventType } from '@/lib/events/types';
import { cn } from '@/lib/utils';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';

interface EditEventTemplateProps {
  defaultEventTemplate: EventTemplate;
}

export default function EditEventTemplateDialog({
  defaultEventTemplate
}: EditEventTemplateProps) {
  const { projectId } = useProjectContext();
  const router = useRouter();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const name = defaultEventTemplate.name;
  const [eventType, setEventType] = useState<EventType | null>(
    defaultEventTemplate.eventType
  );

  const updateEvent = async () => {
    setIsLoading(true);

    const res = await fetch(
      `/api/projects/${projectId}/event-templates/${defaultEventTemplate.id}`,
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          eventType
        })
      }
    );

    const data = await res.json();

    setIsLoading(false);
    setIsDialogOpen(false);
    setEventType(data.eventType);
    router.refresh();
  };

  const isReady = () => eventType && name.length > 0;

  return (
    <>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary">Edit</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit event</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label>Name</Label>
            <Input placeholder="Name" disabled value={name} />
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
                <SelectItem key="boolean" value={EventType.BOOLEAN}>
                  Boolean
                </SelectItem>
                <SelectItem key="string" value={EventType.STRING}>
                  String
                </SelectItem>
                <SelectItem key="number" value={EventType.NUMBER}>
                  Number
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={updateEvent} disabled={isLoading || !isReady()}>
              <Loader2
                className={cn(
                  'mr-2 hidden',
                  isLoading ? 'animate-spin block' : ''
                )}
                size={16}
              />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
