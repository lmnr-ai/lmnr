"use client";

import { python } from "@codemirror/lang-python";
import { zodResolver } from "@hookform/resolvers/zod";
import CodeMirror from "@uiw/react-codemirror";
import { Loader2, PlayIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { PropsWithChildren, useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useSWRConfig } from "swr";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { theme } from "@/components/ui/code-highlighter/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { IconPython } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Evaluator } from "@/lib/evaluators/types";
import { useToast } from "@/lib/hooks/use-toast";
import { PaginatedResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const EVALUATOR_TYPES = [{ value: "python", label: "Python" }];

const createEvaluatorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  evaluatorType: z.string().min(1, "Evaluator type is required"),
  code: z.string().min(1, "Code is required"),
  testInput: z.string(),
});

type CreateEvaluatorForm = z.infer<typeof createEvaluatorSchema>;

const defaultValues: CreateEvaluatorForm = {
  name: "",
  evaluatorType: "python",
  code: `def evaluate(input):
    if not input:
        return 0
    
    keywords = ["relevant", "accurate", "helpful"]
    score = sum(1 for keyword in keywords if keyword.lower() in str(input).lower())
    
    return min(score * 33, 100)`,
  testInput: "",
};

export default function CreateEvaluatorDialog({
  children,
  onSuccess,
}: PropsWithChildren<{ onSuccess?: (evaluator: Evaluator) => void }>) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
  } = useForm<CreateEvaluatorForm>({
    resolver: zodResolver(createEvaluatorSchema),
    defaultValues,
  });

  const createNewEvaluator = useCallback(
    async (data: CreateEvaluatorForm) => {
      try {
        setIsLoading(true);

        const evaluator = {
          name: data.name,
          evaluatorType: data.evaluatorType,
          definition: {
            function_code: data.code,
          },
        };

        const res = await fetch(`/api/projects/${projectId}/evaluators`, {
          method: "POST",
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
            description: errorText || "Failed to create the evaluator",
          });
          return;
        }

        const newEvaluator = (await res.json()) as Evaluator;

        await mutate<PaginatedResponse<Evaluator>>(
          `/api/projects/${projectId}/evaluators`,
          (currentData) =>
            currentData
              ? { items: [newEvaluator, ...currentData.items], totalCount: currentData.totalCount + 1 }
              : { items: [newEvaluator], totalCount: 1 },
          { revalidate: false, populateCache: true, rollbackOnError: true }
        );

        if (onSuccess) {
          onSuccess(newEvaluator);
        }

        toast({ title: "Successfully created evaluator" });
        setIsDialogOpen(false);
        reset();
        setTestOutput("");
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "Failed to create the evaluator. Please try again.",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [onSuccess, projectId, toast, reset]
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
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) {
          reset(defaultValues);
          setTestOutput("");
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Create new evaluator</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 px-4 overflow-y-auto">
          <form onSubmit={handleSubmit(createNewEvaluator)} className="grid gap-4 py-4 px-2">
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
              <Label htmlFor="type">Type</Label>
              <Controller
                name="evaluatorType"
                control={control}
                render={({ field }) => (
                  <Select disabled onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select evaluator type" />
                    </SelectTrigger>
                    <SelectContent>
                      {EVALUATOR_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.evaluatorType && <p className="text-sm text-red-500">{errors.evaluatorType.message}</p>}
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

            <DialogFooter className="sticky bottom-0">
              <Button type="submit" disabled={isLoading || !isValid} handleEnter>
                <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={16} />
                Create
              </Button>
            </DialogFooter>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
