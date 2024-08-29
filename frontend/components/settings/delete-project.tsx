'use client'

import { Button } from "../ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog';
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { useState } from "react";
import { useProjectContext } from "@/contexts/project-context";
import { Loader, Trash } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeleteProjectProps { }

export default function DeleteProject({ }: DeleteProjectProps) {
    const { projectId, projectName } = useProjectContext()

    const [inputProjectName, setInputProjectName] = useState<string>('')
    const [isDeleteProjectDialogOpen, setIsDeleteProjectDialogOpen] = useState(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const deleteProject = async () => {
        setIsLoading(true);

        const res = await fetch(`/api/projects/${projectId}`, {
            method: 'DELETE'
        });

        // Full force reload of the page. Otherwise, the project
        // will still be accessible in the projects page.
        window.location.href = '/projects';
    }

    return (
        <div>
            <div className="flex flex-col items-start space-y-4">
                <h1 className="text-lg">Delete project</h1>
                <Label>
                    Delect project and all of its data. This action cannot be undone.
                </Label>
                <Dialog open={isDeleteProjectDialogOpen} onOpenChange={() => {
                    setIsDeleteProjectDialogOpen(!isDeleteProjectDialogOpen);
                    setInputProjectName('');
                }}>
                    <DialogTrigger asChild>
                        <Button onClick={() => { setIsDeleteProjectDialogOpen(true) }} variant="outline" className="h-8 max-w-80 text-red-500">
                            <Trash className='w-4 mr-1' />
                            Delete project
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Delete project</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <Label>Enter project name</Label>
                            <Input
                                autoFocus
                                placeholder={projectName}
                                onChange={(e) => setInputProjectName(e.target.value)}
                            />
                        </div>
                        <DialogFooter>
                            <Button disabled={(inputProjectName !== projectName) || isLoading} onClick={deleteProject} handleEnter={true}>
                                <Loader className={cn('mr-2 hidden', isLoading ? 'animate-spin block' : '')} size={16} />
                                Delete
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
}
