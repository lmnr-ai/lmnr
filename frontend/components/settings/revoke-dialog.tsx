import { ProjectApiKey } from "@/lib/api-keys/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { useState } from "react";
import { Button } from "../ui/button";
import { Loader, Trash2 } from "lucide-react";
import { Label } from "../ui/label";
import { cn } from "@/lib/utils";

interface RevokeApiKeyDialogProps {
  obj: { name?: string, value: string };
  entity: string;
  onRevoke: (value: string) => Promise<void>;
}

export default function RevokeDialog({ obj, onRevoke, entity }: RevokeApiKeyDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost"> <Trash2 size={14} /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Revoke {entity}
          </DialogTitle>
        </DialogHeader>
        <Label>Are you sure you want to revoke the {entity} {obj.name ?? ''}?</Label>
        <DialogFooter>
          <Button onClick={async () => {
            setIsLoading(true);
            await onRevoke(obj.value);
            setIsLoading(false);
            setIsOpen(false);
          }}>
            <Loader className={cn('mr-2 hidden', isLoading ? 'animate-spin block' : '')} size={16} />
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}