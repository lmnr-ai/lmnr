'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';

import logo from '@/assets/logo/logo.svg';
import { cn, swrFetcher } from '@/lib/utils';
import { WorkspaceWithProjects } from '@/lib/workspaces/types';

import { Skeleton } from '../ui/skeleton';
import AvatarMenu from '../user/avatar-menu';

export default function WorkspacesNavbar() {
  const { data, isLoading } = useSWR('/api/workspaces', swrFetcher);
  const pathname = usePathname();
  return (
    <div className="flex flex-col h-screen fixed border-r w-64 items-center justify-start">
      <Link
        href={'/projects'}
        className="flex h-14 items-center justify-center mb-4 mt-2"
      >
        <Image alt="" src={logo} width={130} />
      </Link>
      <div className="flex flex-col w-full items-start">
        <div className="flex flex-col w-full pl-4 pb-8 border-b space-y-2 text-sm">
          <span className="text-muted-foreground">Projects</span>
          <Link href={'/projects'}>
            All projects
          </Link>
        </div>
        <div className="flex flex-col w-full p-4 border-b space-y-3 text-sm">
          <span className="text-muted-foreground">Workspaces</span>
          {isLoading &&
            [...Array(5).keys()].map((_, index) => (
              <Skeleton key={index} className="h-5 mr-4" />
            ))}
          {!isLoading &&
            (data as WorkspaceWithProjects[]).map((workspace) => (
              <Link
                href={`/workspace/${workspace.id}`}
                key={workspace.id}
                className={cn(
                  'text-secondary-foreground hover:text-primary-foreground',
                  pathname === `/workspace/${workspace.id}` ? 'text-primary-foreground' : ''
                )}
              >
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
