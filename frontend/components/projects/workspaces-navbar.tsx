'use client'

import Image from "next/image";
import Link from "next/link";
import logo from '@/assets/logo/laminar_light.svg';
import AvatarMenu from "../user/avatar-menu";
import useSWR from 'swr';
import { WorkspaceWithProjects } from "@/lib/workspaces/types";
import { Skeleton } from "../ui/skeleton";
import { swrFetcher } from "@/lib/utils";

export default function WorkspacesNavbar() {
  const { data, isLoading } = useSWR('/api/workspaces', swrFetcher);

  return (
    <div className="flex flex-col h-screen fixed border-r w-64 items-center justify-start">
      <Link href={'/projects'} className='flex h-14 items-center justify-center mb-4'>
        <Image alt='' src={logo} width={120} />
      </Link>
      <div className="flex flex-col w-full items-start">
        <div className="flex flex-col w-full pl-4 pb-8 border-b space-y-2">
          <span className="text-gray-600">Projects</span>
          <Link href={'/projects'} className="hover:text-gray-400">
            All projects
          </Link>
        </div>
        <div className="flex flex-col w-full pl-4 pb-8 border-b pt-8 space-y-2">
          <span className="text-gray-600">Workspaces</span>
          {isLoading && [...Array(5).keys()].map((_, index) => (<Skeleton key={index} className="h-5 mr-4" />))}
          {!isLoading && (data as WorkspaceWithProjects[]).map((workspace) => (
            <Link href={`/workspace/${workspace.id}`} key={workspace.id} className="hover:text-gray-500">
              {workspace.name}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex-grow"></div>
      <div className="pb-8">
        <AvatarMenu />
      </div>
    </div>
  );
}
