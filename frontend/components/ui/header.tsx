'use client';

import Link from 'next/link';

import { useProjectContext } from '@/contexts/project-context';

import { Button } from './button';

interface HeaderProps {
  path: string;
  children?: React.ReactNode;
  className?: string;
}

export default function Header({ path, children, className }: HeaderProps) {
  const { projectId, projectName } = useProjectContext();

  const segments = path.split('/');

  return (
    <div
      className={`font-medium flex items-center justify-between flex-none h-12 border-b w-full ${className}`}
    >
      <div className="flex items-center">
        {projectName && (
          <div className="pl-4 text-secondary-foreground items-center flex space-x-3">
            <p>{projectName}</p>
            <div className="text-secondary-foreground/40">/</div>
          </div>
        )}
        {segments.map((segment, index) => (
          <div key={index} className="flex items-center">
            {index > 0 && <div className="text-secondary-foreground/40">/</div>}
            {index === segments.length - 1 ? (
              <div className="px-3">{segment}</div>
            ) : (
              <Link
                href={`/project/${projectId}/${segment.replace(/ /g, '-')}`}
                className="hover:bg-secondary rounded-lg px-2 mx-1 p-0.5 text-secondary-foreground"
              >
                {segment}
              </Link>
            )}
          </div>
        ))}
        {children}
      </div>
      <div className="flex space-x-2 pr-4">
        <Button variant={'ghost'}>
          <a href="https://docs.lmnr.ai/" target="_blank">
            Docs
          </a>
        </Button>
        <Button variant={'ghost'}>
          <a href="https://cal.com/skull8888888/30min" target="_blank">
            Book a demo
          </a>
        </Button>
      </div>
    </div>
  );
}
