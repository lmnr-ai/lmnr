"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { type CancellationReason } from "@/lib/actions/checkout/types";

const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  too_expensive: "Too expensive",
  missing_features: "Missing features I need",
  switched_service: "Switched to another service",
  unused: "Not using it enough",
  too_complex: "Too complex to use",
  low_quality: "Quality didn't meet expectations",
  customer_service: "Customer service issues",
  other: "Other",
};

interface CancelSubscriptionDialogProps {
  children: ReactNode;
  workspaceId: string;
  tierName: string;
  periodEnd: string;
  onError: (error: string) => void;
}

export default function CancelSubscriptionDialog({
  children,
  workspaceId,
  tierName,
  periodEnd,
  onError,
}: CancelSubscriptionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isCanceling, startCancelTransition] = useTransition();
  const [cancelReason, setCancelReason] = useState<CancellationReason | null>(null);
  const [cancelComment, setCancelComment] = useState("");

  const handleCancel = () => {
    if (!cancelReason) return;
    startCancelTransition(async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/subscription/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: cancelReason, comment: cancelComment }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Failed to cancel subscription");
        }
        setOpen(false);
        router.refresh();
      } catch (e: any) {
        onError(e.message ?? "Failed to cancel subscription");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          setCancelReason(null);
          setCancelComment("");
        }
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
          <DialogDescription>
            We&apos;re sorry to see you go. Please let us know why you&apos;re canceling.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm text-secondary-foreground">
          <p>
            Your <span className="font-medium text-foreground">{tierName}</span> plan will be canceled at the end of the
            current billing period on <span className="font-medium text-foreground">{periodEnd}</span>. You will retain
            access to all features until then.
          </p>
          <div className="flex flex-col gap-2">
            <Label className="text-foreground font-medium">Reason for canceling</Label>
            <RadioGroup
              value={cancelReason ?? ""}
              onValueChange={(value) => {
                setCancelReason(value as CancellationReason);
                if (value !== "other") setCancelComment("");
              }}
            >
              {(Object.entries(CANCELLATION_REASON_LABELS) as [CancellationReason, string][]).map(([value, label]) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem value={value} id={`cancel-reason-${value}`} />
                  <Label htmlFor={`cancel-reason-${value}`} className="font-normal cursor-pointer">
                    {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          {cancelReason === "other" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="cancel-comment" className="text-foreground font-medium">
                Tell us more
              </Label>
              <Textarea
                id="cancel-comment"
                placeholder="What could we have done better?"
                value={cancelComment}
                onChange={(e) => setCancelComment(e.target.value)}
                className="resize-none"
                rows={3}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isCanceling}>
            Keep subscription
          </Button>
          <Button variant="destructive" disabled={!cancelReason || isCanceling} onClick={handleCancel}>
            {isCanceling && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
            Cancel subscription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
