'use client';

import { cn } from '@/lib/utils';
import {
  Cable,
  Database,
  Rows4,
  Settings,
  LayoutGrid,
  FlaskConical,
  Pen
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import logo from '@/assets/logo/icon.svg';
import AvatarMenu from '../user/avatar-menu';

interface ProjectNavBarProps {
  projectId: string;
  fullBuild: boolean;
}

export default function ProjectNavbarResizable({
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

  const navbarOptions = allOptions.filter((option) => {
    if (!fullBuild) {
      return !['dashboard'].includes(option.name);
    }
    return true;
  });

  return (
    <div className="flex flex-col h-screen border-r text-md items-start w-14 relative group">
      <div className="absolute top-0 left-0 h-full hover:w-48 w-14 transition-[width] duration-200 ease-out border-r z-50 bg-background">
        <Link
          href={'/projects'}
          className="flex h-14 items-center w-14 group-hover:w-full px-4 py-2"
        >
          <Image alt="Laminar AI icon" src={logo} height={20} />
        </Link>
        <div className="flex flex-col mt-2 w-full space-y-1">
          {navbarOptions.map((option, i) => (
            <Link
              href={option.href}
              className={cn(
                'flex items-center mx-2 px-2 py-2 rounded text-secondary-foreground',
                'group-hover:w-[calc(100%-16px)] w-10',
                'transition-all duration-200 ease-out',
                pathname.startsWith(option.href)
                  ? 'bg-secondary text-primary-foreground' // Highlight active option
                  : 'hover:bg-secondary/50' // Hover effect for options
              )}
            >
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <option.icon size={20} />
              </div>
              <span className="hidden group-hover:block ml-2 text-sm transition-opacity duration-200 opacity-0 group-hover:opacity-100 whitespace-nowrap">
                {option.name.charAt(0).toUpperCase() + option.name.slice(1)}
              </span>
            </Link>
          ))}
        </div>
        <div className="absolute bottom-0 left-0 mb-8 mt-2 w-14 group-hover:w-full px-4">
          <AvatarMenu />
        </div>
      </div>
    </div>
  );
}
