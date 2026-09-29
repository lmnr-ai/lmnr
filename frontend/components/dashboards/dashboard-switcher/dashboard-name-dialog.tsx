import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface DashboardNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitText: string;
  initialName?: string;
  onSubmit: (name: string) => Promise<boolean>;
}

const DashboardNameDialog = ({
  open,
  onOpenChange,
  title,
  submitText,
  initialName = "",
  onSubmit,
}: DashboardNameDialogProps) => {
  const [name, setName] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    const ok = await onSubmit(name.trim());
    setIsSubmitting(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="Dashboard name"
          placeholder="e.g. Costs"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button handleEnter onClick={handleSubmit} disabled={!name.trim() || isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            {submitText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DashboardNameDialog;
