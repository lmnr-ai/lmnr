'use client';

import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { useToast } from '@/lib/hooks/use-toast';
import { WorkspaceStats } from '@/lib/usage/types';
import { formatTimestamp } from '@/lib/utils';
import { WorkspaceUser, WorkspaceWithUsers } from '@/lib/workspaces/types';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '../ui/tooltip';
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
            {workspace.tierName.trim().toLowerCase() === 'pro' && (
              <PurchaseSeatsDialog
                workspaceId={workspace.id}
                currentQuantity={workspaceStats.membersLimit}
                seatsIncludedInTier={workspaceStats.seatsIncludedInTier}
                onUpdate={() => {
                  router.refresh();
                }}
              />
            )}
            {users.length >= workspaceStats.membersLimit ? (
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
                      {isAddUserLoading && (
                        <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      )}
                      Invite
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
        <div className="w-2/3">
          <Table>
            <TableHeader className="">
              <TableRow className="border-none bg-card text-card-foreground rounded-lg overflow-hidden">
                <TableHead className="p-2 rounded-l-lg">Email</TableHead>
                <TableHead className="p-2">Role</TableHead>
                <TableHead className="p-2 rounded-r-lg">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user, i) => (
                <TableRow key={i} className="h-14">
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>{formatTimestamp(user.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
