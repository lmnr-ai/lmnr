'use client';

import { WorkspaceWithUsers } from '@/lib/workspaces/types';
import Link from 'next/link';
import { Label } from '../ui/label';

interface WorkspaceProps {
  workspace: WorkspaceWithUsers;
  isOwner: boolean;
}

export default function WorkspaceComponent({
  workspace,
  isOwner,
}: WorkspaceProps) {
  return (
    <div className="flex flex-col">
      <Label className='p-2'>
        <Link href="/projects">
          Back to all projects
        </Link>
      </Label>
    </div>
  );
}
