'use client'

import { cn } from '@/lib/utils';
import { Cable, Database, Gauge, LockKeyhole, Rocket, Rows4, Settings, File, Home, LayoutGrid, ArrowBigDown, ArrowBigUp } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import icon from '@/assets/logo/icon_light.svg';
import AvatarMenu from '../user/avatar-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface ProjectNavBarProps {
  projectId: string;
}

export default function ProjectNavbarCollapsed({ projectId }: ProjectNavBarProps) {

  const pathname = usePathname()

  const navbarOptions = [
    // {
    //   name: 'home',
    //   href: `/project/${projectId}`,
    //   icon: LayoutGrid,
    //   current: false
    // },
    {
      name: 'pipelines',
      href: `/project/${projectId}/pipelines`,
      icon: Cable,
      current: false
    },
    {
      name: 'traces',
      href: `/project/${projectId}/traces`,
      icon: Rows4,
      current: false
    },
    // {
    //   name: 'datasets',
    //   href: `/project/${projectId}/datasets`,
    //   icon: Database,
    //   current: false
    // },
    // {
    //   name: 'evaluations',
    //   href: `/project/${projectId}/evaluations`,
    //   icon: Gauge,
    //   current: false
    // },
    {
      name: 'events',
      href: `/project/${projectId}/event-templates`,
      icon: ArrowBigUp,
      current: false
    },
    {
      name: 'env variables',
      href: `/project/${projectId}/env`,
      icon: LockKeyhole,
      current: false
    },
    {
      name: 'settings',
      href: `/project/${projectId}/settings`,
      icon: Settings,
      current: false
    }
  ];

  return (
    <div className="flex flex-col h-screen border-r w-full text-md items-center">
      <Link href={'/projects'} className='flex h-14 items-center justify-center mb-4 mt-1'>
        <Image alt='Laminar AI icon' src={icon} width={40} />
      </Link>
      <div className="flex flex-col">
        {navbarOptions.map((option, i) => (
          <TooltipProvider key={i} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={option.href} className={cn('hover:bg-secondary flex items-center p-2 rounded', pathname === option.href ? "bg-secondary" : "")}>
                  <option.icon size={20} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side='right'>
                <div className=''>
                  {option.name}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
      <div className='flex-grow'></div>
      <div className='mb-8 mt-2'>
        <AvatarMenu />
      </div>
    </div>
  );
}
