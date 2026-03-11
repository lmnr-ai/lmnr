import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function CreatePlaygroundDialog() {
  const [newPlaygroundName, setNewPlaygroundName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { projectId } = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const createNewPlayground = async () => {
    setIsLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/playgrounds`, {
        method: "POST",
        body: JSON.stringify({ name: newPlaygroundName }),
      });

      if (!res.ok) {
        toast({ title: "Failed to create playground", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const json = await res.json();
      setIsDialogOpen(false);
      setIsLoading(false);
      router.push(`/project/${projectId}/playgrounds/${json.id}`);
    } catch {
      toast({ title: "Failed to create playground", variant: "destructive" });
      setIsLoading(false);
    }
  };

  return (
    <>
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          setNewPlaygroundName("");
        }}
      >
        <DialogTrigger asChild>
          <Button icon="plus" className="w-fit">
            Playground
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create new playground</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input autoFocus placeholder="Enter name..." onChange={(e) => setNewPlaygroundName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={createNewPlayground} disabled={!newPlaygroundName || isLoading} handleEnter>
              <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={16} />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
