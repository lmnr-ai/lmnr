import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';

import { Input } from '../ui/input';
import { Label } from "../ui/label";

interface PurchaseSeatsDialogProps {
  workspaceId: string;
  currentQuantity?: number;
  seatsIncludedInTier?: number;
  onUpdate?: () => void;
}

export default function PurchaseSeatsDialog({
  workspaceId,
  currentQuantity = 1,
  seatsIncludedInTier = 1,
  onUpdate,
}: PurchaseSeatsDialogProps) {
  const [quantity, setQuantity] = useState<number | null>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Dialog onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) {
        setQuantity(0);
      }
    }} open={isOpen}>
      <DialogTrigger asChild>
        <Button variant="default">Add seats</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add seats</DialogTitle>
        </DialogHeader>
        <p>Purchase additional seats for your workspace.</p>
        <Label className="text-sm text-secondary-foreground">
          Your current tier includes {seatsIncludedInTier} seats.
          You have {currentQuantity - seatsIncludedInTier} additional seats.
        </Label>
        <Input
          type="number"
          onChange={(e) =>
            e.target.value === ''
              ? setQuantity(null)
              : setQuantity(Math.max(0, parseInt(e.target.value)))
          }
          value={quantity?.toString() ?? ''}
        />
        <DialogFooter>
          <Button
            className="flex flex-row items-center"
            disabled={isLoading || quantity === null || quantity <= 0}
            onClick={async () => {
              setIsLoading(true);
              await fetch(`/api/workspaces/${workspaceId}/update-seats`, {
                method: "POST",
                body: JSON.stringify({
                  quantity: quantity,
                }),
              });
              setIsLoading(false);
              setIsOpen(false);
              onUpdate?.();
            }}
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Purchase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
