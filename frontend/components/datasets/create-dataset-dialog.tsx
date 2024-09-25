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
import { Button } from '@/components/ui/button';
import { Loader, Plus } from 'lucide-react';
import { cn, fetcher } from '@/lib/utils';
import { useState } from 'react';
import { useProjectContext } from '@/contexts/project-context';
import { useRouter } from 'next/navigation';

interface CreateDatasetDialogProps { }

export default function CreateDatasetDialog({ }: CreateDatasetDialogProps) {
  const [newDatasetName, setNewDatasetName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { projectId } = useProjectContext();
  const router = useRouter();

  const createNewDataset = async () => {
    setIsLoading(true);

    const dataset = {
      name: newDatasetName,
      projectId: projectId
    }

    const res = await fetch(`/api/projects/${projectId}/datasets`, {
      method: 'POST',
      body: JSON.stringify(dataset)
    });

    if (res.status !== 200) {
      console.error('Failed to create the dataset', await res.text());
      setIsLoading(false);
      return;
    }

    const json = await res.json();

    setIsDialogOpen(false);
    setIsLoading(false);

    router.push(`/project/${projectId}/datasets/${json.id}`);
  };

  return (
    <>
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        setNewDatasetName('');
      }}>
        <DialogTrigger asChild>
          <Button variant="default">
            New dataset
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create new dataset</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label>Name</Label>
            <Input
              autoFocus
              placeholder="Name"
              onChange={(e) => setNewDatasetName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={createNewDataset} disabled={!newDatasetName || isLoading} handleEnter>
              <Loader className={cn('mr-2 hidden', isLoading ? 'animate-spin block' : '')} size={16} />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
