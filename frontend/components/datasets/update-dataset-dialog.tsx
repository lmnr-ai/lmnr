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
import { Loader, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { DropdownMenuItem } from '../ui/dropdown-menu';
import { Dataset } from '@/lib/dataset/types';

interface UpdateDatasetDialogProps {
  oldDataset: Dataset;
  doUpdate?: (datasetId: string, dataset: Dataset) => void;
  isDropdown?: boolean;
}

export default function UpdateDatasetDialog({ oldDataset, doUpdate, isDropdown = false }: UpdateDatasetDialogProps) {

  const [dataset, setDataset] = useState<Dataset | undefined>(oldDataset);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const updateDataset = async (datasetId: string) => {
    setIsLoading(true);
    doUpdate?.(datasetId, dataset!);
    setIsLoading(false);
    setOpen(false);
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {isDropdown ? (
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}> Edit </DropdownMenuItem>
          ) : (
            <Button variant='outline'>
              <Pencil size={16} className='mr-2' /> Edit
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Update dataset {oldDataset.name ?? ''}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label>Name</Label>
            <Input
              autoFocus
              placeholder="Enter name"
              value={dataset?.name ?? ''}
              onChange={(e) => setDataset({ ...dataset, name: e.target.value } as Dataset)}
            />
          </div>
          <DialogFooter>
            <Button onClick={async (_) => { await updateDataset(dataset?.id!) }} disabled={!dataset || isLoading}>
              <Loader className={cn('mr-2 hidden', isLoading ? 'animate-spin block' : '')} size={16} />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
