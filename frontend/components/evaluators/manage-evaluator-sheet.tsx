"use client";

import { python } from "@codemirror/lang-python";
import CodeMirror from "@uiw/react-codemirror";
import { Loader2, PlayIcon } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { PropsWithChildren, useCallback, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { useSWRConfig } from "swr";

import { defaultValues, ManageEvaluatorForm } from "@/components/evaluators/evaluators";
import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { theme } from "@/components/ui/code-highlighter/utils";
import { IconPython } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Evaluator } from "@/lib/evaluators/types";
import { useToast } from "@/lib/hooks/use-toast";
import { PaginatedResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ManageEvaluatorSheet({
  children,
  open,
  setOpen,
}: PropsWithChildren<{ open: boolean; setOpen: (open: boolean) => void }>) {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [testOutput, setTestOutput] = useState("");

  const { projectId } = useParams();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    watch,
    formState: { errors, isValid },
  } = useFormContext<ManageEvaluatorForm>();

  const id = useWatch({
    name: "id",
    control,
  });

  const submit = useCallback(
    async (data: ManageEvaluatorForm) => {
      try {
        setIsLoading(true);

        const evaluator = {
          name: data.name,
          evaluatorType: data.evaluatorType,
          definition: {
            function_code: data.code,
          },
        };

        const isUpdate = !!data.id;
        const url = isUpdate
          ? `/api/projects/${projectId}/evaluators/${data.id}`
          : `/api/projects/${projectId}/evaluators`;
        const method = isUpdate ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(evaluator),
        });

        if (!res.ok) {
          const errorText = await res.text();
          toast({
            variant: "destructive",
            title: "Error",
            description: errorText || `Failed to ${isUpdate ? "update" : "create"} the evaluator`,
          });
          return;
        }

        const resultEvaluator = (await res.json()) as Evaluator;

        const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : 25;
        const pageNumber = searchParams.get("pageNumber") ? Number(searchParams.get("pageNumber")) : 0;

        await mutate<PaginatedResponse<Evaluator>>(
          `/api/projects/${projectId}/evaluators?pageNumber=${pageNumber}&pageSize=${pageSize}`,
          (currentData) => {
            if (!currentData) return currentData;

            if (isUpdate) {
              return {
                ...currentData,
                items: currentData.items.map((item) => (item.id === resultEvaluator.id ? resultEvaluator : item)),
              };
            } else {
              return {
                items: [resultEvaluator, ...currentData.items],
                totalCount: currentData.totalCount + 1,
              };
            }
          },
          { revalidate: false, populateCache: true, rollbackOnError: true }
        );

        toast({ title: `Successfully ${isUpdate ? "updated" : "created"} evaluator` });
        setOpen(false);
        reset();
        setTestOutput("");
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description:
            e instanceof Error
              ? e.message
              : `Failed to ${data.id ? "update" : "create"} the evaluator. Please try again.`,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, searchParams, mutate, toast, setOpen, reset]
  );

  const testEvaluator = useCallback(async () => {
    const code = getValues("code");
    const testInput = getValues("testInput");

    if (!code || !testInput.trim()) return;

    setIsExecuting(true);
    setTestOutput("");

    try {
      const parsedInput = (() => {
        try {
          return JSON.parse(testInput);
        } catch (jsonError) {
          setTestOutput(`JSON Parse Error: ${jsonError instanceof Error ? jsonError.message : "Invalid JSON format"}`);
          throw jsonError;
        }
      })();

      const executeRes = await fetch(`/api/projects/${projectId}/evaluators/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: parsedInput,
          definition: {
            function_code: code,
          },
        }),
      });

      const result = await executeRes.json();

      if (!executeRes.ok) {
        setTestOutput(`Error: ${result.error || "Failed to execute evaluator"}`);
      } else {
        setTestOutput(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      setTestOutput(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsExecuting(false);
    }
  }, [getValues, projectId]);

  return (
    <Sheet
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) {
          reset(defaultValues);
          setTestOutput("");
        }
      }}
    >
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="min-w-[50vw] w-full flex flex-col gap-0">
        <SheetHeader className="pt-4 px-4">
          <SheetTitle>{id ? getValues("name") : "Create new evaluator"}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <form onSubmit={handleSubmit(submit)} className="grid gap-4 p-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Controller
                rules={{ required: true }}
                name="name"
                control={control}
                render={({ field }) => <Input id="name" placeholder="Evaluator name" autoFocus {...field} />}
              />
              {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label className="flex gap-1 items-center" htmlFor="definition">
                <IconPython className="fill-white" /> Python code
              </Label>
              <Controller
                name="code"
                control={control}
                render={({ field }) => (
                  <div className="border rounded-md bg-muted/50 overflow-hidden">
                    <CodeMirror value={field.value} onChange={field.onChange} extensions={[python()]} theme={theme} />
                  </div>
                )}
              />
              {errors.code && <p className="text-sm text-red-500">{errors.code.message}</p>}
            </div>

            <div className="grid gap-2 border-t pt-4">
              <Label htmlFor="testInput">Test Input (JSON)</Label>
              <Controller
                name="testInput"
                control={control}
                render={({ field }) => (
                  <CodeHighlighter
                    placeholder='"This response is very relevant, accurate, and helpful"'
                    className="min-h-20"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              {errors.testInput && <p className="text-sm text-red-500">{errors.testInput.message}</p>}
              <Button
                className="self-start w-fit"
                type="button"
                variant="outline"
                onClick={testEvaluator}
                disabled={!watch("code") || !watch("testInput").trim() || isExecuting}
              >
                {isExecuting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <PlayIcon className="w-4 h-4 mr-1" />
                )}
                Test
              </Button>

              {testOutput && (
                <div className="space-y-2">
                  <Label>Output</Label>
                  <div className="p-3 bg-muted rounded-md text-sm font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {testOutput}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button type="submit" disabled={isLoading || !isValid} handleEnter>
                <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={16} />
                {id ? "Save" : "Create"}
              </Button>
            </div>
          </form>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
