import {
  LabelClass,
  LabelSource,
  RegisteredLabelClassForPath,
  Span,
} from '@/lib/traces/types';
import { cn, swrFetcher } from '@/lib/utils';
import { useState } from 'react';
import useSWR from 'swr';
import {
  ChevronDown,
  Loader2,
  MoreVertical,
  Plus,
  Tag,
  X
} from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { useProjectContext } from '@/contexts/project-context';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../ui/table';
import { v4 } from 'uuid';
import { renderNodeInput } from '@/lib/flow/utils';
import { PopoverClose } from '@radix-ui/react-popover';
import { toast, useToast } from '@/lib/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu';
import { EvaluatorEditorDialog } from '../evaluator/evaluator-editor-dialog';
import { Graph } from '@/lib/flow/graph';
import { CodeNode, LLMNode, NodeType } from '@/lib/flow/types';
import { Switch } from '../ui/switch';
import { eventEmitter } from '@/lib/event-emitter';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { AddLabel } from '../traces/add-label';

interface LabelsProps {
  span: Span | undefined;
  className?: string;
}

export function Labels({ span }: LabelsProps) {
  const { projectId } = useProjectContext();
  const { data: labelClasses, mutate: mutateLabelClasses } = useSWR<LabelClass[]>(`/api/projects/${projectId}/label-classes`, swrFetcher);
  const [open, setOpen] = useState(false);
  const [isDeletingLabelClass, setIsDeletingLabelClass] = useState(false);

  const deleteLabelClass = async (labelClassId: string) => {
    setIsDeletingLabelClass(true);
    const res = await fetch(
      `/api/projects/${projectId}/label-classes/${labelClassId}`,
      {
        method: 'DELETE'
      }
    );

    setIsDeletingLabelClass(false);
    if (res.ok) {
      mutateLabelClasses();
      eventEmitter.emit('mutateSpanLabels');

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
      <div className="flex-col items-center space-y-2">
        <div className="flex justify-between">
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
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Add label</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-base">
              {labelClasses?.map((labelClass) => (
                <TableRow key={labelClass.id} className="px-0 mx-0">
                  <TableCell className="p-0 py-2">
                    <div className={cn('flex')}>
                      <p className="border rounded-lg bg-secondary p-1 px-2 text-sm overflow-hidden truncate max-w-[150px]">
                        {labelClass.name}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="px-0">
                    <AddLabelInstance
                      span={span}
                      projectId={projectId}
                      labelClass={labelClass}
                      onAddLabel={(value) => {
                        mutateLabelClasses();
                      }}
                    />
                  </TableCell>
                  <TableCell className="w-12">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button className="w-12" variant="ghost">
                          <MoreVertical size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <Dialog>
                          <DialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              Delete label class
                            </DropdownMenuItem>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Delete Label Class</DialogTitle>
                              <DialogDescription>
                                Are you sure you want to delete this label class? This will also delete all labels with this class.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={(e) => {
                                  (e.target as HTMLElement).closest('dialog')?.close();
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={() => deleteLabelClass(labelClass.id)}
                                disabled={isDeletingLabelClass}
                              >
                                {isDeletingLabelClass ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Deleting
                                  </>
                                ) : (
                                  'Delete'
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

function AddLabelInstance({
  span,
  projectId,
  labelClass,
  onAddLabel
}: {
  span: Span | undefined;
  projectId: string;
  labelClass: LabelClass;
  onAddLabel: (value: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const addLabel = async (
    value: string,
    labelClass: LabelClass,
    source: LabelSource,
    reasoning?: string
  ) => {
    const response = await fetch(
      `/api/projects/${projectId}/spans/${span?.spanId}/labels`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          classId: labelClass.id,
          value: labelClass.valueMap[value],
          source: source,
          reasoning: reasoning
        })
      }
    );

    setIsLoading(false);

    if (response.ok) {
      onAddLabel(value);
      eventEmitter.emit('mutateSpanLabels');
      toast({
        title: 'Label added',
        description: `${labelClass.name} label with value ${value} was successfully added.`
      });
    } else {
      toast({
        title: 'Error',
        description: 'Failed to add label',
        variant: 'destructive'
      });
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          Add
          <ChevronDown size={14} className="ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end">
        <div className="flex flex-col space-y-2">
          {Object.entries(labelClass.valueMap).map(([key, value], index) => (
            <PopoverClose key={index}>
              <div
                onClick={() => {
                  addLabel(key, labelClass, LabelSource.MANUAL);
                }}
                className="cursor-pointer hover:bg-secondary-foreground/10 p-1 rounded border px-2"
              >
                {key}
              </div>
            </PopoverClose>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
