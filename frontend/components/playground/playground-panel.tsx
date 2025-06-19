"use client";
import { GenerateTextResult, ToolSet } from "ai";
import { isEmpty } from "lodash";
import { ChevronRight, History, Loader, PlayIcon, Square } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useMemo, useRef } from "react";
import { Controller, ControllerRenderProps, SubmitHandler, useFormContext } from "react-hook-form";
import { useHotkeys } from "react-hotkeys-hook";

import Messages from "@/components/playground/messages";
import LlmSelect from "@/components/playground/messages/llm-select";
import ParamsPopover from "@/components/playground/messages/params-popover";
import ToolsSheet from "@/components/playground/messages/tools-sheet";
import PlaygroundHistoryTable from "@/components/playground/playground-history-table";
import { usePlaygroundOutput } from "@/components/playground/playground-output";
import ProvidersAlert from "@/components/playground/providers-alert";
import { Provider } from "@/components/playground/types";
import Usage from "@/components/playground/usage";
import { getDefaultThinkingModelProviderOptions } from "@/components/playground/utils";
import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/lib/hooks/use-toast";
import { PlaygroundForm } from "@/lib/playground/types";
import { parseSystemMessages } from "@/lib/playground/utils";
import { ProviderApiKey } from "@/lib/settings/types";

export default function PlaygroundPanel({
  id,
  apiKeys,
  onTraceSelect,
}: {
  id: string;
  apiKeys: ProviderApiKey[];
  onTraceSelect?: (traceId: string) => void;
}) {
  const params = useParams();
  const { toast } = useToast();
  const {
    setText,
    setUsage,
    setToolCalls,
    reset,
    setIsLoading,
    isLoading,
    text,
    toolCalls,
    toolResults,
    setToolResults,
    setReasoning,
    reasoning,
    history,
    setHistory,
    usage,
    error,
    setError,
  } = usePlaygroundOutput();

  const { control, handleSubmit, setValue } = useFormContext<PlaygroundForm>();
  const abortControllerRef = useRef<AbortController | null>(null);

  const abortRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, [setIsLoading]);

  const submit: SubmitHandler<PlaygroundForm> = useCallback(
    async (form) => {
      try {
        reset();
        setIsLoading(true);

        abortControllerRef.current = new AbortController();

        const response = await fetch(`/api/projects/${params?.projectId}/chat`, {
          signal: abortControllerRef.current.signal,
          method: "POST",
          body: JSON.stringify({
            projectId: params?.projectId,
            playgroundId: id,
            model: form.model,
            maxTokens: form.maxTokens,
            temperature: form.temperature,
            messages: parseSystemMessages(form.messages),
            providerOptions: form.providerOptions,
            tools: form.tools,
            toolChoice: form.toolChoice,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Request failed");
        }

        const result = (await response.json()) as GenerateTextResult<ToolSet, {}>;

        setText(result.text);
        setToolCalls(result.toolCalls);
        setToolResults(result.toolResults);
        setReasoning(result.reasoning);

        setUsage(result.usage);
      } catch (e) {
        if (e instanceof Error && e.name !== "AbortError") {
          setError(e);
          toast({ title: "Error", description: e.message, variant: "destructive" });
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [
      reset,
      setIsLoading,
      params?.projectId,
      id,
      setText,
      setToolCalls,
      setToolResults,
      setReasoning,
      setUsage,
      setError,
      toast,
    ]
  );

  useHotkeys("meta+enter,ctrl+enter", () => handleSubmit(submit)(), {
    enableOnFormTags: ["input", "textarea"],
    enableOnContentEditable: true,
  });

  const handleModelChange = useCallback(
    (onChange: ControllerRenderProps["onChange"]) =>
      <P extends Provider, K extends string>(value: `${P}:${K}`) => {
        onChange(value);
        setValue("providerOptions", getDefaultThinkingModelProviderOptions(value));
      },
    [setValue]
  );

  const structuredOutput = useMemo(() => {
    const sections = [
      toolCalls?.length > 0 && `<ToolCalls>\n\n${JSON.stringify(toolCalls)}\n\n</ToolCalls>`,
      text,
    ].filter(Boolean);

    return sections.join("\n\n");
  }, [text, toolCalls]);

  if (isEmpty(apiKeys)) {
    return (
      <div className="p-4">
        <ProvidersAlert />
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-2 p-4">
        <Controller
          render={({ field: { value, onChange } }) => (
            <LlmSelect className="w-fit h-8" apiKeys={apiKeys} value={value} onChange={handleModelChange(onChange)} />
          )}
          name="model"
          control={control}
        />
        <ParamsPopover />
        <ToolsSheet />
        <Button
          variant={history ? "outlinePrimary" : "outline"}
          size="sm"
          onClick={() => setHistory(!history)}
          className="h-8 w-fit px-2"
        >
          <History className="w-4 h-4 mr-1" />
          History
        </Button>
        {isLoading ? (
          <Button variant="outlinePrimary" onClick={abortRequest} className="ml-auto h-8 w-fit px-2">
            <Square className="w-4 h-4 mr-2" />
            <span className="mr-2">Stop</span>
            <Loader className="animate-spin w-4 h-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit(submit)} className="ml-auto h-8 w-fit px-2">
            <PlayIcon className="w-4 h-4 mr-2" />
            <span className="mr-2">Run</span>
            <div className="text-center text-xs opacity-75">⌘ + ⏎</div>
          </Button>
        )}
      </div>
      <ResizablePanelGroup autoSaveId={`playground:${id}`} direction="vertical" className="flex flex-1">
        <ResizablePanel minSize={30} className="flex flex-col pb-4">
          <ResizablePanelGroup autoSaveId={`playground-main:${id}`} direction="horizontal" className="flex flex-1">
            <ResizablePanel minSize={30} className="flex flex-col flex-1 gap-2">
              <Messages />
            </ResizablePanel>
            <ResizableHandle className="hover:bg-blue-600 active:bg-blue-600" />
            <ResizablePanel minSize={20} className="flex-1 flex flex-col gap-2 px-4">
              {reasoning && (
                <Collapsible className="group">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="focus-visible:ring-0 justify-start w-full rounded-b-none p-0">
                      <ChevronRight className="w-4 h-4 text-muted-foreground mr-2 group-data-[state=open]:rotate-90 transition-transform duration-200" />
                      <span>Reasoning</span>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-hidden p-1 pb-2">
                    <ScrollArea className="border-l pl-2">
                      <div className="max-h-40">
                        <span className="font-mono text-xs">{reasoning}</span>
                      </div>
                    </ScrollArea>
                  </CollapsibleContent>
                </Collapsible>
              )}
              <div className="flex flex-1 overflow-hidden">
                <CodeHighlighter
                  codeEditorClassName="rounded-b"
                  className="rounded"
                  value={structuredOutput}
                  defaultMode="json"
                />
              </div>
              <Usage usage={usage} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        {history && (
          <>
            <ResizableHandle className="hover:bg-blue-600 active:bg-blue-600" />
            <ResizablePanel minSize={20} defaultSize={30} className="flex flex-col">
              <div className="px-4 py-2 border-b">
                <h3 className="text-sm font-medium">Playground runs history</h3>
              </div>
              <div className="flex-1 overflow-auto">
                <PlaygroundHistoryTable playgroundId={id} onTraceSelect={onTraceSelect} />
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </>
  );
}
