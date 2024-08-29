'use client';

import { useUserContext } from "@/contexts/user-context";
import { Label } from "../ui/label";
import useSWR from "swr";
import { UserStats } from "@/lib/profile/types";
import { swrFetcher } from "@/lib/utils";
import { Skeleton } from "../ui/skeleton";
import UserUsage from "./user-usage";
import WorkspaceCards from "./workspace-cards";
import { Workspace } from "@/lib/workspaces/types";

export default function Usage() {
  const user = useUserContext();
  const { data: userInfo, isLoading, error } = useSWR<UserStats>('/api/limits/user', swrFetcher);
  const {
    data: ownedWorkspaces,
    isLoading: isWorkspacesLoading,
    error: workspacesError
  } = useSWR<Workspace[]>('/api/workspaces?accessLevel=owner', swrFetcher);

  return (
    (isLoading || isWorkspacesLoading || error || workspacesError || !userInfo || !ownedWorkspaces)
      ? (<Skeleton className="h-full p-4 w-full flex-grow" />)
      : (
        <div className="h-full p-4 w-full flex-grow">
          <div className='flex flex-col items-start space-y-4'>
            <div className='flex flex-row space-x-2'>
              <Label className="font-bold mb-4">Email:</Label>
              <Label className="text-secondary-foreground">{user.email}</Label>
            </div >
            <UserUsage stats={userInfo} />
          </div >
          <WorkspaceCards workspaces={ownedWorkspaces} userStats={userInfo} />
        </div >
      )
  )
}
