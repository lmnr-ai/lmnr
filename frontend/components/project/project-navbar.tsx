'use client'

import { cn } from '@/lib/utils';
import { Cable, Database, Gauge, LockKeyhole, Rocket, Rows4 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import logo from '@/assets/logo/laminar.svg';
import AvatarMenu from '../user/avatar-menu';

interface ProjectNavBarProps {
  projectId: string;
}

export default function ProjectNavbar({ projectId }: ProjectNavBarProps) {

  const pathname = usePathname()

  const navbarOptions = [
    {
      name: 'pipelines',
      href: `/project/${projectId}/pipelines`,
      icon: Cable,
      current: false
    },
    {
      name: 'datasets',
      href: `/project/${projectId}/datasets`,
      icon: Database,
      current: false
    },
    {
      name: 'endpoints',
      href: `/project/${projectId}/endpoints`,
      icon: Rocket,
      current: false
    },
    {
      name: 'logs',
      href: `/project/${projectId}/logs`,
      icon: Rows4,
      current: false
    },
    {
      name: 'api keys',
      href: `/project/${projectId}/api-keys`,
      icon: LockKeyhole,
      current: false
    }
  ];

  return (
    <div className="flex flex-col h-screen border-r w-48 text-md items-center">
      <Link href={'/projects'} className='flex h-14 items-center justify-center mb-4'>
        <Image alt='' src={logo} width={120} />
      </Link>
      <div className="flex flex-col w-32">
        {navbarOptions.map((option, i) => (

          <Link key={i} href={option.href} className={cn('flex items-center p-2 rounded', pathname.includes(option.href) ? "bg-gray-200" : "")}>
            <option.icon size={20} className='mr-4' />
            {option.name}
          </Link>
        ))}
      </div>
      <div className='flex-grow'></div>
      <div className='mb-8'>
        <AvatarMenu />
      </div>
    </div>
  );
}
