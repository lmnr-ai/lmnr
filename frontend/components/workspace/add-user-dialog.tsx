import { Loader2, User } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { track } from "@/lib/analytics";
import { Feature } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";
import { type Workspace } from "@/lib/workspaces/types";

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
}

const AddUserDialog = ({ open, onOpenChange, workspace }: AddUserDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState("");
  const { toast } = useToast();
  const featureFlags = useFeatureFlags();
  const isSendEmailEnabled = featureFlags[Feature.SEND_EMAIL];
  const showError = useCallback(
    (message: string) => {
      toast({
        title: "Error",
        variant: "destructive",
        description: message,
        duration: 10000,
      });
    },
    [toast]
  );

  const router = useRouter();
  const inviteUser = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/invite`, {
        method: "POST",
        body: JSON.stringify({ email: user.trim() }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({ error: "Failed to invite user." }))) as { error: string };
        throw new Error(error?.error ?? "Failed to invite user.");
      }

      onOpenChange(false);
      toast({ description: "Invitation sent successfully." });
      track("team", "invitation_sent");
      router.refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to invite user.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        setUser("");
      }}
    >
      <DialogTrigger asChild>
        <Button icon="plus" onClick={() => onOpenChange(true)} variant="outline">
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invite a member to workspace</DialogTitle>
          <DialogDescription>
            {isSendEmailEnabled
              ? "This invitation will expire in 2 days."
              : "If the user doesn't have an account yet, they will be automatically added when they sign up."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col space-y-2">
          <Label>Email</Label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-2 top-1.5" />
            <Input className="pl-8" autoFocus placeholder="Enter email" onChange={(e) => setUser(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={isLoading || user.trim() === ""}
            handleEnter={true}
            onClick={async () => {
              await inviteUser();
              onOpenChange(false);
              setUser("");
            }}
          >
            {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddUserDialog;
