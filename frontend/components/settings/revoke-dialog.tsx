import { Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ProjectApiKey } from '@/lib/api-keys/types';
import { cn } from '@/lib/utils';

import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../ui/dialog';
import { Label } from '../ui/label';

interface RevokeApiKeyDialogProps {
  apiKey: ProjectApiKey;
  entity: string;
  onRevoke: (id: string) => Promise<void>;
}

export default function RevokeDialog({
  apiKey,
  onRevoke,
  entity
}: RevokeApiKeyDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost">
          {' '}
          <Trash2 size={14} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke {entity}</DialogTitle>
        </DialogHeader>
        <Label>
          Are you sure you want to revoke the {entity} {apiKey.name ?? ''}?
        </Label>
        <DialogFooter>
          <Button
            onClick={async () => {
              setIsLoading(true);
              await onRevoke(apiKey.id);
              setIsLoading(false);
              setIsOpen(false);
            }}
          >
            <Loader2
              className={cn(
                'mr-2 hidden',
                isLoading ? 'animate-spin block' : ''
              )}
              size={16}
            />
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
