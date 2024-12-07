'use client';

import {
  Cable,
  Database,
  FlaskConical,
  LayoutGrid,
  Pen,
  PlayCircle,
  Rows4,
  Settings
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import smallLogo from '@/assets/logo/icon.svg';
import fullLogo from '@/assets/logo/logo.svg';
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

import AvatarMenu from '../user/avatar-menu';

interface ProjectNavBarProps {
  projectId: string;
  fullBuild: boolean;
}

export default function ProjectNavbar({ projectId, fullBuild }: ProjectNavBarProps) {
  const pathname = usePathname();
  const { open, openMobile } = useSidebar();

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
      name: 'playgrounds',
      href: `/project/${projectId}/playgrounds`,
      icon: PlayCircle,
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
    <Sidebar className="border-r" collapsible='icon'>
      <SidebarHeader className="h-14 bg-background">
        <Link href="/projects" className={`flex h-14 items-center ${open || openMobile ? 'justify-start pl-2' : 'justify-center'}`}>
          <Image
            alt="Laminar AI logo"
            src={open || openMobile ? fullLogo : smallLogo}
            width={open || openMobile ? 120 : 20}
            height={open || openMobile ? undefined : 20}
          />
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex flex-col pt-2 bg-background">
        <SidebarMenu className={`${open || openMobile ? undefined : "justify-center items-center flex"}`}>
          {navbarOptions.map((option, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith(option.href)}
                tooltip={option.name}
              >
                <Link href={option.href} className={cn(
                  'hover:bg-secondary flex items-center p-2 rounded text-secondary-foreground',
                  pathname.startsWith(option.href) ? 'bg-secondary text-primary-foreground' : ''
                )}>
                  <option.icon className="flex justify-center items-center !w-[20px] !h-[20px]" />
                  <span>{option.name}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <div className="flex-grow" />
        <div className="p-4">
          <AvatarMenu showDetails={open || openMobile} />
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
