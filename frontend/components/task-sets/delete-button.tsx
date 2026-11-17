"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { fetchApi } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";

interface DeleteButtonProps {
  url: string;
  title: string;
  description: string;
  onDeleted: () => void;
}

/** A trash icon that asks first, then sends `DELETE url`. */
export default function DeleteButton({ url, title, description, onDeleted }: DeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    const { error } = await fetchApi(url, { method: "DELETE" });
    if (error) {
      toast({ variant: "destructive", title: error });
      return;
    }
    onDeleted();
  };

  return (
    <>
      <Button variant="ghost" size="icon" aria-label={title} onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5 text-secondary-foreground" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmText="Delete"
        onConfirm={handleConfirm}
      />
    </>
  );
}
