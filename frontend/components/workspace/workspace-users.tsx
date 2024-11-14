'use client';

import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Loader2, Plus } from 'lucide-react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { useCallback, useState } from 'react';
import { WorkspaceUser, WorkspaceWithUsers } from '@/lib/workspaces/types';
import { useToast } from '@/lib/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '../ui/tooltip';
import { useRouter } from 'next/navigation';
import { WorkspaceStats } from '@/lib/usage/types';
import PurchaseSeatsDialog from './purchase-seats-dialog';

interface WorkspaceUsersProps {
  workspace: WorkspaceWithUsers;
  workspaceStats: WorkspaceStats;
  isOwner: boolean;
}

export default function WorkspaceUsers({
  workspace,
  workspaceStats,
  isOwner
}: WorkspaceUsersProps) {
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isAddUserLoading, setIsAddUserLoading] = useState(false);
  const [users, setUsers] = useState<WorkspaceUser[]>(workspace.users);
  const [newUserEmail, setNewUserEmail] = useState<string>('');
  const { toast } = useToast();
  const router = useRouter();

  const showError = useCallback((message: string) => {
    toast({
      title: 'Error',
      variant: 'destructive',
      description: message,
      duration: 10000
    });
  }, []);

  const inviteUser = async () => {
    setIsAddUserLoading(true);

    const res = await fetch(`/api/workspaces/${workspace.id}/invite`, {
      method: 'POST',
      body: JSON.stringify({ email: newUserEmail.trim() })
    });

    if (!res.ok) {
      if (res.status === 400) {
        showError(await res.text());
      } else {
        showError(`Failed to add user`);
      }
      setIsAddUserLoading(false);
      return;
    }

    await res.text();
    setIsAddUserLoading(false);

    router.refresh();
  };

  return (
    <div className="p-4">
      <div className="flex flex-col items-start space-y-4">
        <Label>You have {workspaceStats.membersLimit} seat{workspaceStats.membersLimit > 1 ? 's' : ''} in this workspace</Label>
        {isOwner && (
          <div className="flex flex-row gap-4">
            {workspaceStats.tierName === 'Pro' && (
              <PurchaseSeatsDialog
                workspaceId={workspace.id}
                currentQuantity={workspaceStats.membersLimit}
                seatsIncludedInTier={workspaceStats.seatsIncludedInTier}
                onUpdate={() => {
                  router.refresh();
                }}
              />
            )}
            {users.length == workspaceStats.membersLimit ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div tabIndex={0}>
                      <Button variant="outline" disabled>
                        <Plus className="w-4 mr-1 text-gray-500" />
                        Invite member
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    You have reached the maximum number of users for this
                    workspace.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Dialog
                open={isAddUserDialogOpen}
                onOpenChange={() => {
                  setIsAddUserDialogOpen(!isAddUserDialogOpen);
                  setNewUserEmail('');
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    onClick={() => {
                      setIsAddUserDialogOpen(true);
                    }}
                    variant="outline"
                  >
                    <Plus className="w-4 mr-1" />
                    Invite member
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Invite member to workspace</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col space-y-2">
                    <Label>Email</Label>
                    <Input
                      autoFocus
                      placeholder="Enter email"
                      onChange={(e) => setNewUserEmail(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      disabled={isAddUserLoading || newUserEmail.trim() === ''}
                      handleEnter={true}
                      onClick={async () => {
                        await inviteUser();
                        setIsAddUserDialogOpen(false);
                        setNewUserEmail('');
                      }}
                    >
                      Invite
                    </Button>
                    {isAddUserLoading && (
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
        <table className="w-2/3 border-t">
          <tbody>
            {users.map((user, i) => (
              <tr key={i} className="border-b h-14">
                <td className="">{i + 1}</td>
                <td className="ml-4 text-[16px]">{user.email}</td>
                <td className="ml-4 text-[16px]">{user.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
