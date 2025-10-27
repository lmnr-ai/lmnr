import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { PropsWithChildren, useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export default function WorkspaceCreateDialog({ children }: PropsWithChildren) {
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const createNewWorkspace = async () => {
    setIsLoading(true);
    const res = await fetch("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({
        name: newWorkspaceName,
      }),
    });

    const newWorkspace = (await res.json()) as { id: string; name: string; tierName: string; projectId?: string };

    router.push(`/workspace/${newWorkspace.id}`);
    setIsLoading(false);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-96">
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label>Name</Label>
          <Input autoFocus placeholder="Enter name..." onChange={(e) => setNewWorkspaceName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={createNewWorkspace} handleEnter={true} disabled={!newWorkspaceName || isLoading}>
            {isLoading && <Loader2 className="mr-2 animate-spin" size={16} />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
