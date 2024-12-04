import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import React, { useState } from 'react';

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
import { useProjectContext } from '@/contexts/project-context';
import { Dataset } from '@/lib/dataset/types';
import { useToast } from '@/lib/hooks/use-toast';
import { cn } from '@/lib/utils';

import { Input } from '../ui/input';

interface IndexDatasetDialogProps {
  datasetId: string;
  defaultDataset: Dataset;
  onUpdate?: () => void;
}

export default function IndexDatasetDialog({
  datasetId,
  defaultDataset,
  onUpdate
}: IndexDatasetDialogProps) {
  const { projectId } = useProjectContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [selectedIndexKey, setSelectedIndexKey] = useState<string>(
    defaultDataset.indexedOn ?? ''
  );
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const indexDataset = async () => {
    setIsLoading(true);

    let res = await fetch(
      `/api/projects/${projectId}/datasets/${datasetId}/index`,
      {
        method: 'POST',
        body: JSON.stringify({ indexColumn: selectedIndexKey !== '' ? selectedIndexKey : null }),
        cache: 'no-cache'
      }
    );

    if (res.status != 200) {
      setIsLoading(false);
      toast({
        title: 'Error indexing dataset'
      });
      return;
    }

    toast({
      title: 'Successfully indexed dataset'
    });

    const newDataset = await res.json();
    setSelectedIndexKey(newDataset.indexedOn);
    onUpdate?.();

    setIsLoading(false);
    setIsDialogOpen(false);
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        {defaultDataset.indexedOn ? (
          <div
            className={cn(
              'text-sm text-secondary-foreground cursor-pointer rounded border py-0.5 px-2',
              'border-primary bg-primary/10 text-primary'
            )}
          >
            Indexed on {`'${defaultDataset.indexedOn}'`} key
          </div>
        ) : (
          <Button variant="outline">Not indexed</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Index dataset</DialogTitle>
        </DialogHeader>
        <Label>
          Type the key from datapoint {'"'}data{'"'} to index this dataset.
        </Label>
        <Label className="text-sm text-secondary-foreground">
          New datapoints are indexed automatically.{' '}
          <Link
            className="text-primary"
            href="https://docs.lmnr.ai/datasets/indexing"
            target="_blank"
          >
            Learn more
          </Link>
        </Label>
        <Input
          defaultValue={defaultDataset?.indexedOn ?? ''}
          onChange={(e) => setSelectedIndexKey(e.target.value)}
        />
        <DialogFooter>
          <Button
            className="my-4"
            disabled={
              isLoading ||
              selectedIndexKey === defaultDataset.indexedOn
            }
            onClick={async () => await indexDataset()}
            handleEnter
          >
            {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            {selectedIndexKey === '' ? 'Unindex' : 'Index'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
