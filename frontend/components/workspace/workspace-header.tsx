interface workspaceHeaderProps {
  workspaceName: string
}

export default function WorkspaceHeader({ workspaceName }: workspaceHeaderProps) {
  return (
    <div className="flex-none font-medium flex items-center h-14 border-b">
      <div className="flex pl-4">
        workspaces
        <div className='pl-4 pr-1 text-gray-400'>/</div>
        <div className='px-3'>{workspaceName}</div>
      </div>
    </div>
  )
}