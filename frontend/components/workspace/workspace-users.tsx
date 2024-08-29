'use client'

import { Button } from "../ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Loader, Plus } from "lucide-react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { useCallback, useState } from "react";
import { WorkspaceUser, WorkspaceWithInfo } from "@/lib/workspaces/types";
import { useToast } from "@/lib/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useRouter } from "next/navigation";

interface WorkspaceUsersProps {
  workspaceId: string
  workspaceUsers: WorkspaceUser[]
  isOwner: boolean
  maxUsers?: number
}

export default function WorkspaceUsers({ workspaceId, workspaceUsers, isOwner, maxUsers }: WorkspaceUsersProps) {
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isAddUserLoading, setIsAddUserLoading] = useState(false);
  const [users, setUsers] = useState<WorkspaceUser[]>(workspaceUsers)
  const [newUserEmail, setNewUserEmail] = useState<string>('')
  const { toast } = useToast();
  const router = useRouter();

  const showError = useCallback((message: string) => {
    toast({ title: "Error", variant: 'destructive', description: message, duration: 10000 })
  }, [])


  const addUser = async () => {
    setIsAddUserLoading(true);

    const res = await fetch(`/api/workspaces/${workspaceId}/users`, {
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

    const data = await res.text();
    refreshUsers();

    setIsAddUserLoading(false);
  }

  // This is quick hack to avoid using store, useSWR, or other techniques to update the users' list
  const refreshUsers = async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}`, {
      method: 'GET'
    });
    const data: WorkspaceWithInfo = await res.json()
    setUsers(data.users)
  }

  return (
    <div>
      <div className="flex flex-col items-start space-y-4">
        <h1 className="text-lg">Users</h1>
        <Label>
          {isOwner ? `
          Users who have access to this workspace.
          You can add users by email that they used to register with Laminar.
          They will be added and have access to workspace immediately.
          ` : "Users who have access to this workspace."}
        </Label>
        {isOwner && (
          <>
            {(maxUsers != null && users.length >= maxUsers)
              ?
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div tabIndex={0}>
                      <Button variant="outline" disabled>
                        <Plus className='w-4 mr-1 text-gray-500' />
                        Add user
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    You have reached the maximum number of users for this workspace.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              :
              <Dialog open={isAddUserDialogOpen} onOpenChange={() => {
                setIsAddUserDialogOpen(!isAddUserDialogOpen);
                setNewUserEmail('');
              }}>
                <DialogTrigger asChild>
                  <Button onClick={() => { setIsAddUserDialogOpen(true) }} variant="outline" className="h-8 max-w-80">
                    <Plus className='w-4 mr-1 text-gray-500' />
                    Add user
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Add user by email</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
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
                        await addUser()
                        setIsAddUserDialogOpen(false);
                        setNewUserEmail('');
                      }}>
                      Add
                    </Button>
                    {isAddUserLoading && <Loader className='animate-spin h-4 w-4 mr-2' />}
                  </DialogFooter>
                </DialogContent>
              </Dialog>}
          </>
        )}
        <table className="w-2/3 border-t">
          <tbody>
            {
              users.map((user, i) => (
                <tr key={i} className="border-b h-14">

                  <td className="">{i + 1}</td>
                  <td className="ml-4 text-[16px]">{user.email}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}
