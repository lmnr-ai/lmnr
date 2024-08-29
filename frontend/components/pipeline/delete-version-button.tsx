import { useContext, useState } from "react";
import { ProjectContext } from '@/contexts/project-context'
import { Loader, MoreVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PipelineVersionInfo } from '@/lib/pipeline/types';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface DeletePipelineVersionButtonProps {
  selectedPipelineVersion: PipelineVersionInfo;
}

export default function DeletePipelineVersionButton({ selectedPipelineVersion }: DeletePipelineVersionButtonProps) {
  const { projectId } = useContext(ProjectContext)
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [deleteVersionInputText, setDeleteVersionInputText] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const deletePipelineVersion = async () => {
    setIsDeleting(true);

    const res = await fetch(
      `/api/projects/${projectId}/pipelines/${selectedPipelineVersion.pipelineId}/versions/${selectedPipelineVersion.id}`,
      {
        method: 'DELETE'
      }
    );

    if (!res.ok) {
      const text = await res.text()
      console.error(`Failed to delete the pipeline version: ${text}`);
    }

    // NOTE: This is a quick hack. The best way is to update everything from Pipeline component
    // without reloading the page. However, the problem is that the dropdown, which selects the pipeline version,
    // is not updated correctly and it's hard to access its value.
    window.location.reload();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <MoreVertical className="h-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => {
            setIsDialogOpen(true);
          }}>
            <Trash2 className="h-4" />
            Delete version
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Are you sure you want to delete the version?</DialogTitle>
            <DialogDescription>
              You cannot undo this action.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>Type version name to confirm</Label>
            <Input
              autoFocus
              placeholder={selectedPipelineVersion.name}
              onChange={(e) => setDeleteVersionInputText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={deleteVersionInputText != selectedPipelineVersion.name}
              onClick={deletePipelineVersion}>
              <Loader className={cn('mr-2 hidden', isDeleting ? 'animate-spin block' : '')} size={16} />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
