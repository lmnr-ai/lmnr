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

export default function CreatePlaygroundDialog() {
  const [newPlaygroundName, setNewPlaygroundName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { projectId } = useProjectContext();
  const router = useRouter();

  const createNewPlayground = async () => {
    setIsLoading(true);

    const playground = {
      name: newPlaygroundName,
      projectId: projectId
    };

    const res = await fetch(`/api/projects/${projectId}/playgrounds`, {
      method: 'POST',
      body: JSON.stringify(playground)
    });

    if (res.status !== 200) {
      console.error('Failed to create the playground', await res.text());
      setIsLoading(false);
      return;
    }

    const json = await res.json();

    setIsDialogOpen(false);
    setIsLoading(false);

    router.push(`/project/${projectId}/playgrounds/${json.id}`);
  };

  return (
    <>
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          setNewPlaygroundName('');
        }}
      >
        <DialogTrigger asChild>
          <Button variant="default">New playground</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create new playground</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label>Name</Label>
            <Input
              autoFocus
              placeholder="Name"
              onChange={(e) => setNewPlaygroundName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={createNewPlayground}
              disabled={!newPlaygroundName || isLoading}
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
    </>
  );
}
