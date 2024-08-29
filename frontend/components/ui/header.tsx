'use client'

import { useProjectContext } from '@/contexts/project-context'
import { Button } from './button'
import Link from 'next/link'

interface HeaderProps {
  path: string
  children?: React.ReactNode
}

export default function Header({ path, children }: HeaderProps) {

  const { projectId, projectName } = useProjectContext()

  const segments = path.split('/')

  return (
    <div className="font-medium flex items-center justify-between flex-none h-14 border-b w-full">
      <div className="flex pl-4 items-center">
        <div className='pr-4 text-secondary-foreground items-center'>
          {projectName}
        </div>
        {segments.map((segment, index) => {
          return (
            <div key={index} className='flex items-center'>
              <div className='text-secondary-foreground/40'>/</div>
              {index === segments.length - 1 ? <div className='px-3'>{segment}</div> :
                <Link href={`/project/${projectId}/${segment.replace(/ /g, '-')}`} className='hover:bg-secondary rounded-lg px-2 mx-1 p-0.5 text-secondary-foreground'>{segment}</Link>
              }
            </div>
          )
        })}
        {children}
      </div>
      <div className='flex space-x-2 pr-4'>
        <Button variant={"ghost"}>
          <a href="https://docs.lmnr.ai/introduction" target="_blank">
            Docs
          </a>
        </Button>
        <Button variant={"ghost"}>
          <a href="https://cal.com/skull8888888/30min" target="_blank">
            Book a demo
          </a>
        </Button>

      </div>
    </div>
  )
};

