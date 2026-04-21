import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type PropsWithChildren, useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export default function WorkspaceCreateDialog({ children }: PropsWithChildren) {
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const createNewWorkspace = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({
          name: newWorkspaceName,
        }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({ error: "Failed to create workspace" }))) as { error: string };
        throw new Error(error?.error ?? "Failed to create workspace");
      }

      const newWorkspace = (await res.json()) as { id: string; name: string; tierName: string; projectId?: string };

      track("workspace", "created");
      router.push(`/workspace/${newWorkspace.id}`);
    } catch (e) {
      toast({
        title: "Error creating workspace",
        variant: "destructive",
        description: e instanceof Error ? e.message : "Failed to create workspace",
      });
    } finally {
      setIsLoading(false);
    }
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
