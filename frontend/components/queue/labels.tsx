import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { useProjectContext } from "@/contexts/project-context";
import { toast } from "@/lib/hooks/use-toast";
import { LabelClass, Span } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";

import { AddLabel } from "../traces/add-label";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Table, TableBody, TableCell, TableRow } from "../ui/table";

interface LabelsProps {
  span: Span | undefined;
  className?: string;
  onAddLabel: (labelClass: LabelClass) => void;
}

export function Labels({ span, onAddLabel }: LabelsProps) {
  const { projectId } = useProjectContext();
  const { data: labelClasses, mutate: mutateLabelClasses } = useSWR<LabelClass[]>(
    `/api/projects/${projectId}/label-classes`,
    swrFetcher
  );
  const [open, setOpen] = useState(false);
  const [isDeletingLabelClass, setIsDeletingLabelClass] = useState(false);

  const deleteLabelClass = async (labelClassId: string) => {
    setIsDeletingLabelClass(true);
    const res = await fetch(`/api/projects/${projectId}/label-classes/${labelClassId}`, {
      method: "DELETE",
    });

    setIsDeletingLabelClass(false);
    if (res.ok) {
      mutateLabelClasses();

      toast({
        title: "Label class deleted",
        description: "The label class has been successfully deleted.",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to delete label class",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="flex flex-col w-full">
        <div className="flex justify-between flex-none">
          <h2 className="text-lg font-medium">Labels</h2>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Add Label
              </Button>
            </PopoverTrigger>
            <PopoverContent className="min-w-[500px] mr-4" side="bottom" align="start">
              <AddLabel
                span={span!}
                onClose={() => {
                  mutateLabelClasses();
                  setOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex-col space-y-1">
          <Table>
            <TableBody className="text-base">
              {labelClasses?.map((labelClass) => (
                <TableRow key={labelClass.id} className="hover:bg-transparent px-0 mx-0">
                  <TableCell className="p-0 py-2">
                    <Badge className="rounded-3xl" variant="outline">
                      <div style={{ background: labelClass.color }} className={`w-2 h-2 rounded-full`} />
                      <span className="ml-1.5">{labelClass.name}</span>
                    </Badge>
                  </TableCell>
                  <TableCell className="w-12">
                    <Dialog>
                      <div className="flex gap-2">
                        <Button onClick={() => onAddLabel(labelClass)} className="h-fit" variant="ghost" size="icon">
                          <Plus size={14} />
                        </Button>
                        <DialogTrigger asChild>
                          <Button className="h-fit" variant="ghost" size="icon">
                            <Trash2 size={14} />
                          </Button>
                        </DialogTrigger>
                      </div>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete Label Class</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to delete this label class? This will also delete all labels with this
                            class.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                          </DialogClose>
                          <Button onClick={() => deleteLabelClass(labelClass.id)} disabled={isDeletingLabelClass}>
                            {isDeletingLabelClass ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Deleting
                              </>
                            ) : (
                              "Delete"
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
