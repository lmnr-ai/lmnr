'use client'

import React, { useContext } from 'react'
import { ProjectContext } from '@/contexts/project-context'

export default function LogsHeader() {
  const { projectName } = useContext(ProjectContext)

  return (
    <div className="z-20 font-medium flex items-center min-h-14 border-b">
      <div className="flex pl-4">
        {projectName}
        <div className='pl-4 pr-1 text-gray-400'>/</div>
        <div className='px-3'>logs</div>
      </div>
    </div>
  )
}