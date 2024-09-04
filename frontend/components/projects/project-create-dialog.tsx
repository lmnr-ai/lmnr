import { Project, WorkspaceWithProjects } from "@/lib/workspaces/types"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from "../ui/button";
import { Loader, Plus } from "lucide-react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";

interface ProjectCreateDialogProps {
  onProjectCreate?: () => void
  workspaces: WorkspaceWithProjects[]
}

export default function ProjectCreateDialog({ onProjectCreate, workspaces }: ProjectCreateDialogProps) {
  const [newProjectWorkspaceId, setNewProjectWorkspaceId] = useState<string | undefined>(undefined)
  const [newProjectName, setNewProjectName] = useState('')

  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const router = useRouter()

  const createNewProject = useCallback(async () => {
    setIsCreatingProject(true)
    const res = await fetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: newProjectName,
        workspaceId: newProjectWorkspaceId
      })
    })

    const newProject = await res.json() as Project

    onProjectCreate?.();
    router.push(`/project/${newProject.id}/traces`)
    setIsCreatingProject(false)
  }, [newProjectName, newProjectWorkspaceId])

  return (
    <Dialog onOpenChange={() => {
      if (workspaces.length > 0) {
        setNewProjectWorkspaceId(workspaces[0].id)
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="default">
          <Plus size={16} className='mr-1' />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Label>Workspace</Label>
          <Select
            onValueChange={setNewProjectWorkspaceId}
            defaultValue={(workspaces.length > 0) ? workspaces[0].id : undefined}
          >
            <SelectTrigger className="mb-4 h-8 w-full font-medium">
              <SelectValue placeholder="Select workspace" />
            </SelectTrigger>
            <SelectContent>
              {
                Object.values(workspaces).map((workspace, i) => (
                  <SelectItem key={`workspace-id-${i}`} value={workspace.id}>
                    {workspace.name}
                  </SelectItem>
                ))
              }
            </SelectContent>
          </Select>
          <Label>Name</Label>
          <Input
            autoFocus
            placeholder="Name"
            onChange={(e) => setNewProjectName(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={createNewProject} handleEnter={true} disabled={newProjectWorkspaceId === undefined || !newProjectName}>
            {isCreatingProject && <Loader className='mr-2 animate-spin' size={16} />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}