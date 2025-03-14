import { ChevronDown, Loader2, MoreVertical, Plus, Tag } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { v4 } from "uuid";

import { useProjectContext } from "@/contexts/project-context";
import { eventEmitter } from "@/lib/event-emitter";
import { Graph } from "@/lib/flow/graph";
import { CodeNode, LLMNode, NodeType } from "@/lib/flow/types";
import { renderNodeInput } from "@/lib/flow/utils";
import { toast } from "@/lib/hooks/use-toast";
import { LabelClass, LabelSource, Span } from "@/lib/traces/types";
import { cn, swrFetcher } from "@/lib/utils";

import { EvaluatorEditorDialog } from "../evaluator/evaluator-editor-dialog";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { AddLabel } from "./add-label";

const getEvaluatorType = (labelClass: LabelClass) => {
  if (!labelClass.evaluatorRunnableGraph) {
    return "-";
  }

  const graph = Graph.fromObject(labelClass.evaluatorRunnableGraph as any);

  if (graph) {
    const codeNode = Array.from(graph.nodes.values()).find((node) => node.type === NodeType.CODE) as CodeNode;
    if (codeNode) {
      return "CODE";
    }
    const llmNode = Array.from(graph.nodes.values()).find((node) => node.type === NodeType.LLM) as LLMNode;
    if (llmNode) {
      return "LLM";
    }
  }
  return "-";
};

interface AddLabelPopoverProps {
  span: Span;
  className?: string;
}

export function AddLabelPopover({ span }: AddLabelPopoverProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { projectId } = useProjectContext();
  const { data: labelClasses, mutate: mutateLabelClasses } = useSWR<LabelClass[]>(
    `/api/projects/${projectId}/label-classes`,
    swrFetcher
  );
  // const { data: registeredLabelClasses, mutate: mutateRegisteredLabelClasses } = useSWR<RegisteredLabelClassForPath[]>(
  //   `/api/projects/${projectId}/label-classes/registered-paths?path=${span.attributes["lmnr.span.path"]}`,
  //   swrFetcher
  // );
  const [mode, setMode] = useState<"add" | "list">("list");
  const [isDeletingLabelClass, setIsDeletingLabelClass] = useState(false);

  const updateLabelClass = async (labelClass: LabelClass) => {
    const res = await fetch(`/api/projects/${projectId}/label-classes/${labelClass.id}`, {
      method: "POST",
      body: JSON.stringify({
        description: labelClass.description,
        evaluatorRunnableGraph: labelClass.evaluatorRunnableGraph,
      }),
    });

    if (res.ok) {
      mutateLabelClasses();
    }
  };

  // const registerLabelClass = async (labelClass: LabelClass) => {
  //   const res = await fetch(`/api/projects/${projectId}/label-classes/${labelClass.id}/registered-paths`, {
  //     method: "POST",
  //     body: JSON.stringify({
  //       path: span.attributes["lmnr.span.path"],
  //     }),
  //   });
  //
  //   if (res.ok) {
  //     mutateRegisteredLabelClasses();
  //     mutateLabelClasses();
  //   }
  // };

  // const unregisterLabelClass = async (registeredLabelClass: RegisteredLabelClassForPath) => {
  //   const res = await fetch(
  //     `/api/projects/${projectId}/label-classes/${registeredLabelClass.labelClassId}/registered-paths/${registeredLabelClass.id}`,
  //     {
  //       method: "DELETE",
  //     }
  //   );
  //
  //   if (res.ok) {
  //     mutateRegisteredLabelClasses();
  //     mutateLabelClasses();
  //   }
  // };

  const deleteLabelClass = async (labelClassId: string) => {
    setIsDeletingLabelClass(true);
    const res = await fetch(`/api/projects/${projectId}/label-classes/${labelClassId}`, {
      method: "DELETE",
    });

    setIsDeletingLabelClass(false);
    if (res.ok) {
      mutateLabelClasses();
      // mutateRegisteredLabelClasses();
      eventEmitter.emit("mutateSpanLabels");
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
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <Tag size={14} className="mr-2" /> Add label
          </Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="flex flex-col min-w-[550px]">
          <div className="flex-col items-center space-y-2">
            {mode === "list" && (
              <>
                <div className="flex justify-between">
                  <h2 className="text-lg font-medium">Labels</h2>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMode("add");
                    }}
                  >
                    <Plus size={14} className="mr-1" />
                    New label
                  </Button>
                </div>
                <div className="flex-col space-y-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        {/*<TableHead>Evaluator</TableHead>*/}
                        {/*<TableHead>Run on current span</TableHead>*/}
                        {/*<TableHead>Add instance</TableHead>*/}
                        {/*<TableHead></TableHead>*/}
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-base">
                      {labelClasses?.map((labelClass) => (
                        <TableRow key={labelClass.id} className="px-0 mx-0">
                          <TableCell className="p-0 py-2">
                            <div className={cn("flex")}>
                              <p className="border rounded-full p-1 px-2 text-sm overflow-hidden truncate max-w-[150px]">
                                {labelClass.name}
                              </p>
                            </div>
                          </TableCell>
                          {/*<TableCell className="px-0">*/}
                          {/*  <div className="flex">*/}
                          {/*    <span className="text-sm">{getEvaluatorType(labelClass)}</span>*/}
                          {/*  </div>*/}
                          {/*</TableCell>*/}
                          {/*<TableCell className="px-0">*/}
                          {/*  <span className="text-sm">*/}
                          {/*    {labelClass.evaluatorRunnableGraph && (*/}
                          {/*      <Switch*/}
                          {/*        checked={registeredLabelClasses?.some((l) => l.labelClassId === labelClass.id)}*/}
                          {/*        onCheckedChange={(value) => {*/}
                          {/*          if (value) {*/}
                          {/*            registerLabelClass(labelClass);*/}
                          {/*          } else {*/}
                          {/*            unregisterLabelClass(*/}
                          {/*              registeredLabelClasses?.find((l) => l.labelClassId === labelClass.id)!*/}
                          {/*            );*/}
                          {/*          }*/}
                          {/*        }}*/}
                          {/*      />*/}
                          {/*    )}*/}
                          {/*  </span>*/}
                          {/*</TableCell>*/}
                          {/*<TableCell className="px-0">*/}
                          {/*  <AddLabelInstance*/}
                          {/*    span={span}*/}
                          {/*    projectId={projectId}*/}
                          {/*    labelClass={labelClass}*/}
                          {/*    onAddLabel={(value) => {*/}
                          {/*      mutateLabelClasses();*/}
                          {/*    }}*/}
                          {/*  />*/}
                          {/*</TableCell>*/}
                          <TableCell className="w-12">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button className="w-12" variant="ghost">
                                  <MoreVertical size={14} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <div onClick={(e) => e.stopPropagation()}>
                                  <EvaluatorEditorDialog
                                    span={span}
                                    labelClass={labelClass}
                                    onEvaluatorAdded={(evaluatorRunnableGraph) => {
                                      updateLabelClass({
                                        ...labelClass,
                                        evaluatorRunnableGraph: evaluatorRunnableGraph.toObject(),
                                      });
                                    }}
                                  >
                                    <div className="flex rounded items-center p-2 text-sm cursor-default hover:bg-secondary hover:text-primary-foreground transition-colors h-8">
                                      {labelClass.evaluatorRunnableGraph ? "Edit evaluator" : "Add evaluator"}
                                    </div>
                                  </EvaluatorEditorDialog>
                                </div>
                                {labelClass.evaluatorRunnableGraph && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      updateLabelClass({
                                        ...labelClass,
                                        evaluatorRunnableGraph: null,
                                      });
                                    }}
                                  >
                                    Remove evaluator
                                  </DropdownMenuItem>
                                )}
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
                                        Are you sure you want to delete this label class? This will also delete all
                                        labels with this class.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter>
                                      <Button
                                        variant="outline"
                                        onClick={(e) => {
                                          (e.target as HTMLElement).closest("dialog")?.close();
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
                                            Deleting...
                                          </>
                                        ) : (
                                          "Delete"
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
              </>
            )}
            {mode === "add" && (
              <AddLabel
                span={span}
                onClose={() => {
                  setMode("list");
                  mutateLabelClasses();
                  // mutateRegisteredLabelClasses();
                }}
              />
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

function AddLabelInstance({
  span,
  projectId,
  labelClass,
  onAddLabel,
}: {
  span: Span;
  projectId: string;
  labelClass: LabelClass;
  onAddLabel: (value: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();

  const addLabel = async (value: string, labelClass: LabelClass, source: LabelSource, reasoning?: string) => {
    const body = {
      classId: labelClass.id,
      source,
      reasoning,
      scoreName: labelClass.name,
      datapointId: null,
    } as Record<string, any>;

    if (span.attributes["lmnr.span.type"] === "EXECUTOR") {
      body.datapointId = searchParams.get("datapointId");
    }

    const response = await fetch(`/api/projects/${projectId}/spans/${span.spanId}/labels`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    setIsLoading(false);

    if (response.ok) {
      onAddLabel(value);
      eventEmitter.emit("mutateSpanLabels");
      toast({
        title: "Label added",
        description: `${labelClass.name} label with value ${value} was successfully added.`,
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to add label",
        variant: "destructive",
      });
    }
  };

  const runEvaluator = async (labelClass: LabelClass) => {
    setIsLoading(true);
    const response = await fetch(`/api/projects/${projectId}/pipelines/run/graph`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runId: v4(),
        graph: labelClass.evaluatorRunnableGraph,
        inputs: {
          span_input: renderNodeInput(span.input),
          span_output: renderNodeInput(span.output),
        },
        env: {},
        breakpointTaskIds: [],
        pipelineVersionId: v4(),
        prefilledMessages: [],
        startTaskId: null,
        devSessionIds: [],
        stream: false,
      }),
    });

    setIsLoading(false);

    if (!response.ok) {
      console.error("Failed to run evaluator", response);
      toast({
        title: "Error",
        description: "Failed to run evaluator",
        variant: "destructive",
      });
      return;
    }

    const data = await response.json();
    let value = data["outputs"]["output"]["value"];

    const evaluatorType = getEvaluatorType(labelClass);

    if (evaluatorType === "LLM") {
      try {
        // LLM evaluator produces a JSON object with keys "value" and "reasoning"
        const parsedValue = JSON.parse(value);
        addLabel(parsedValue["value"], labelClass, LabelSource.AUTO, parsedValue["reasoning"]);
      } catch (e) {
        toast({
          title: "Error",
          description: "Failed to parse LLM evaluator output",
          variant: "destructive",
        });
      }
    } else {
      // QUICK FIX
      // python return True or False but we parse it into JSON as true/false
      if (value === "true") {
        value = "True";
      } else if (value === "false") {
        value = "False";
      }

      addLabel(value, labelClass, LabelSource.AUTO);
    }

    onAddLabel(value);
    setIsLoading(false);
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
        <div className="flex flex-col">
          {/*<div className="flex flex-col space-y-2">*/}
          {/*  {Object.entries(labelClass.valueMap)*/}
          {/*    .sort(([, valA], [_, valB]) => valA - valB)*/}
          {/*    .map(([key, value], index) => (*/}
          {/*      <PopoverClose key={index}>*/}
          {/*        <div*/}
          {/*          onClick={() => {*/}
          {/*            addLabel(key, labelClass, LabelSource.MANUAL);*/}
          {/*          }}*/}
          {/*          className="cursor-pointer hover:bg-secondary-foreground/10 p-1 rounded border px-2"*/}
          {/*        >*/}
          {/*          {key}*/}
          {/*        </div>*/}
          {/*      </PopoverClose>*/}
          {/*    ))}*/}
          {/*</div>*/}
          {labelClass.evaluatorRunnableGraph && (
            <div className="flex border-t pt-2 mt-2">
              <Button
                className="w-full"
                variant="outline"
                onClick={() => {
                  runEvaluator(labelClass);
                }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 animate-spin w-4 h-4" />
                    Running...
                  </>
                ) : (
                  "Run evaluator"
                )}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
