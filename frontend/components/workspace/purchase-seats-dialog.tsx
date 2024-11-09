import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { useState } from "react";
import { Loader2 } from "lucide-react";

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
  const [quantity, setQuantity] = useState<number|null>(0);
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
        <Button variant="secondary">Purchase seats</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Purchase seats</DialogTitle>
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
