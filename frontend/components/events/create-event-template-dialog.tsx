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
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectContext } from '@/contexts/project-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { EventType } from '@/lib/events/types';

export default function CreateEventTemplateDialog() {
  const { projectId } = useProjectContext();
  const router = useRouter();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [name, setName] = useState<string>('');
  const [eventType, setEventType] = useState<EventType | null>(null);

  const createNewEvent = async () => {
    setIsLoading(true);

    const res = await fetch(`/api/projects/${projectId}/event-templates`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        eventType
      })
    });

    await res.json();

    setIsLoading(false);
    setIsDialogOpen(false);
    setName('');
    router.refresh();
  };

  const isReady = () => eventType && name.length > 0;

  return (
    <>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="default">New event</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create new event</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label>Name</Label>
            <Input
              autoFocus
              placeholder="Name"
              onChange={(e) => setName(e.target.value)}
            />
            <Label>Event type</Label>
            <Select
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
            <Button onClick={createNewEvent} disabled={isLoading || !isReady()}>
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
    </>
  );
}
