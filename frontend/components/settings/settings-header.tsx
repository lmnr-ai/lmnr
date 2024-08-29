'use client'

import { useProjectContext } from "@/contexts/project-context"

export default function SettingsHeader() {
    const { projectName } = useProjectContext()

    return (
        <div className="flex-none font-medium flex items-center h-14 border-b">
            <div className="flex pl-4">
                {projectName}
                <div className='pl-4 pr-1 text-gray-400'>/</div>
                <div className='px-3'>settings</div>
            </div>
        </div>
    )
}