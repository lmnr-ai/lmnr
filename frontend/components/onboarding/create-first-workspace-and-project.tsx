'use client';

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Label } from '../ui/label';
import { WorkspaceWithProjects } from '@/lib/workspaces/types';
import { Loader } from 'lucide-react';

interface CreateFirstWorkspaceAndProjectProps {
    name?: string | null;
}

// TODO: Pass user's name, so that we can pre-fill the workspace name with "{user's name} workspace"
export default function CreateFirstWorkspaceAndProject({ name }: CreateFirstWorkspaceAndProjectProps) {
  const [workspaceName, setWorkspaceName] = useState(name ? `${name}'s workspace` : '');
  const [projectName, setProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();

  const handleButtonClick = async () => {
    setIsLoading(true);

    const res = await fetch('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({
        name: workspaceName,
        projectName
      })
    });

    const newWorkspace = await res.json() as WorkspaceWithProjects;

    setIsLoading(false);

    // As we want user to start from traces page, redirect to it
    // Expect the workspace to contain exactly one created project
    router.push(`/project/${newWorkspace.projects[0].id}/traces`);
  };

  return (
    <div className="max-w-4xl mx-auto mt-12 p-6 rounded-lg shadow-md">
      <div className="flex flex-col">
        <h2 className="text-2xl font-semibold mb-4">Create workspace and first project</h2>
        <div className="flex flex-col mb-6">
          <Label className="block text-sm font-medium text-secondary-foreground mb-2">Workspace Name</Label>
          <Input
            type="text"
            placeholder="Workspace name"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
          />
        </div>
        <div className="flex flex-col mb-6">
          <Label className="block text-sm font-medium text-secondary-foreground mb-2">Project Name</Label>
          <Input
            type="text"
            placeholder="Project name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleButtonClick}
            disabled={!workspaceName || !projectName || isLoading}
            handleEnter={true}
          >
            {isLoading && <Loader className='animate-spin h-4 w-4 mr-2' />}
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
