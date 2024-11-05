'use client';

import { cn } from '@/lib/utils';
import {
  Cable,
  Database,
  Rows4,
  Settings,
  LayoutGrid,
  FlaskConical,
  Pen,
  Tag
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import logo from '@/assets/logo/icon.svg';
import AvatarMenu from '../user/avatar-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

interface ProjectNavBarProps {
  projectId: string;
  fullBuild: boolean;
}

export default function ProjectNavbarCollapsed({
  projectId,
  fullBuild
}: ProjectNavBarProps) {
  const pathname = usePathname();

  const allOptions = [
    {
      name: 'dashboard',
      href: `/project/${projectId}/dashboard`,
      icon: LayoutGrid,
      current: false
    },
    {
      name: 'traces',
      href: `/project/${projectId}/traces`,
      icon: Rows4,
      current: false
    },
    {
      name: 'evaluations',
      href: `/project/${projectId}/evaluations`,
      icon: FlaskConical,
      current: false
    },
    {
      name: 'datasets',
      href: `/project/${projectId}/datasets`,
      icon: Database,
      current: false
    },
    {
      name: 'queues',
      href: `/project/${projectId}/labeling-queues`,
      icon: Pen,
      current: false
    },
    {
      name: 'pipelines',
      href: `/project/${projectId}/pipelines`,
      icon: Cable,
      current: false
    },
    {
      name: 'settings',
      href: `/project/${projectId}/settings`,
      icon: Settings,
      current: false
    }
  ];

  const navbarOptions = allOptions.filter(option => {
    if (!fullBuild) {
      return !['dashboard'].includes(option.name);
    }
    return true;
  });

  return (
    <div className="flex flex-col h-screen border-r text-md items-center w-14">
      <Link
        href={'/projects'}
        className="flex h-14 items-center justify-center"
      >
        <Image alt="Laminar AI icon" src={logo} height={20} />
      </Link>
      <div className="flex flex-col mt-2">
        {navbarOptions.map((option, i) => (
          <TooltipProvider key={i} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={option.href}
                  className={cn(
                    'hover:bg-secondary flex items-center p-2 rounded',
                    pathname.startsWith(option.href) ? 'bg-secondary' : ''
                  )}
                >
                  <option.icon size={20} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="">{option.name}</div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          // <Link
          //   key={i}
          // href={option.href}
          //   className={cn(
          //     'hover:bg-secondary flex items-center px-2 py-2 mx-2 rounded space-x-2 text-secondary-foreground',
          //      pathname === option.href ? "bg-secondary text-primary-foreground" : "")}
          // >
          //   <option.icon size={20} />
          //   <div className='text-sm'>
          //     {option.name.charAt(0).toUpperCase() + option.name.slice(1)}
          //   </div>
          // </Link>
        ))}
      </div>
      <div className="flex-grow"></div>
      <div className="mb-8 mt-2">
        <AvatarMenu />
      </div>
    </div>
  );
}
