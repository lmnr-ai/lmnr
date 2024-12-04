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
import { cn } from '@/lib/utils';

interface CreateQueueDialogProps { }

export default function CreateQueueDialog({ }: CreateQueueDialogProps) {
  const [newQueueName, setNewQueueName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { projectId } = useProjectContext();
  const router = useRouter();

  const createNewQueue = async () => {
    setIsLoading(true);

    const queue = {
      name: newQueueName,
      projectId: projectId
    };

    const res = await fetch(`/api/projects/${projectId}/queues`, {
      method: 'POST',
      body: JSON.stringify(queue)
    });

    if (res.status !== 200) {
      console.error('Failed to create the queue', await res.text());
      setIsLoading(false);
      return;
    }

    const json = await res.json();

    setIsDialogOpen(false);
    setIsLoading(false);

    router.push(`/project/${projectId}/labeling-queues/${json.id}`);
  };

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setIsDialogOpen(open);
        setNewQueueName('');
      }}
    >
      <DialogTrigger asChild>
        <Button variant="default">New queue</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create new queue</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Label>Name</Label>
          <Input
            autoFocus
            placeholder="Name"
            onChange={(e) => setNewQueueName(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            onClick={createNewQueue}
            disabled={!newQueueName || isLoading}
            handleEnter
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
