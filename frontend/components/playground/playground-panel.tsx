"use client";
import { type GenerateTextResult, type ToolSet } from "ai";
import { isEmpty } from "lodash";
import { Bolt, ChevronRight, Loader, Square } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useRef } from "react";
import { Controller, type ControllerRenderProps, type SubmitHandler, useFormContext } from "react-hook-form";
import { useHotkeys } from "react-hotkeys-hook";
import { prettifyError } from "zod/v4";

import Messages from "@/components/playground/messages";
import LlmSelect from "@/components/playground/messages/llm-select";
import ParamsPopover from "@/components/playground/messages/params-popover";
import StructuredOutputSheet from "@/components/playground/messages/structured-output-sheet";
import ToolsSheet from "@/components/playground/messages/tools-sheet";
import PlaygroundHistoryTable from "@/components/playground/playground-history-table";
import { usePlaygroundOutput } from "@/components/playground/playground-output";
import ProvidersAlert from "@/components/playground/providers-alert";
import { type Provider } from "@/components/playground/types";
import Usage from "@/components/playground/usage";
import { getDefaultThinkingModelProviderOptions } from "@/components/playground/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useToast } from "@/lib/hooks/use-toast";
import { type PlaygroundForm } from "@/lib/playground/types";
import { parseSystemMessages } from "@/lib/playground/utils";
import { type ProviderApiKey } from "@/lib/settings/types";

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
    setReasoning,
    reasoning,
    history,
    setHistory,
    usage,
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
            playgroundId: id,
            model: form.model,
            maxTokens: form.maxTokens,
            temperature: form.temperature,
            messages: parseSystemMessages(form.messages),
            providerOptions: form.providerOptions,
            tools: form.tools,
            toolChoice: form.toolChoice,
            structuredOutput: form.structuredOutput,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();

          if (errorData?.name === "ZodError") {
            toast({
              title: "Validation Error",
              description: `Validation failed: ${prettifyError(errorData)}`,
              variant: "destructive",
            });
          } else if (errorData instanceof Error) {
            toast({
              title: "Error",
              description: errorData.message || "Request failed. Please try again.",
              variant: "destructive",
            });
          } else {
            throw new Error(errorData?.error || "Request failed. Please try again.");
          }
          return;
        }

        const result = (await response.json()) as GenerateTextResult<ToolSet, Record<string, never>>;

        setText(result.text);
        setToolCalls(result.toolCalls);
        setReasoning(result.reasoning.map((r) => r.text).join(""));
        setUsage(result.totalUsage);
      } catch (e) {
        if (e instanceof Error && e.name !== "AbortError") {
          toast({ title: "Error", description: e.message, variant: "destructive" });
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [reset, setIsLoading, params?.projectId, id, setText, setToolCalls, setReasoning, setUsage, toast]
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

  if (isEmpty(apiKeys)) {
    return (
      <div className="p-4">
        <ProvidersAlert />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 p-4">
        <Controller
          render={({ field: { value, onChange } }) => (
            <LlmSelect className="w-fit" apiKeys={apiKeys} value={value} onChange={handleModelChange(onChange)} />
          )}
          name="model"
          control={control}
        />
        <ParamsPopover />
        <ToolsSheet />
        <StructuredOutputSheet />
        <Button
          icon="history"
          variant={history ? "outlinePrimary" : "outline"}
          onClick={() => setHistory(!history)}
          className="w-fit"
        >
          History
        </Button>
        {isLoading ? (
          <Button variant="outlinePrimary" onClick={abortRequest} className="ml-auto h-7 w-fit px-2">
            <Square className="w-4 h-4 mr-1" />
            <span className="mr-2 text-xs">Stop</span>
            <Loader className="animate-spin w-4 h-4" />
          </Button>
        ) : (
          <Button icon="playIcon" onClick={handleSubmit(submit)} className="ml-auto w-fit">
            <span className="mr-2 text-xs">Run</span>
            <div className="text-center text-xs opacity-75">⌘ + ⏎</div>
          </Button>
        )}
      </div>
      <ResizablePanelGroup orientation="vertical" className="flex flex-1">
        <ResizablePanel minSize={30} className="flex flex-col pb-4">
          <ResizablePanelGroup orientation="horizontal" className="flex flex-1">
            <ResizablePanel minSize={30} className="flex flex-col flex-1">
              <Messages />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel minSize={20} className="flex-1 flex flex-col gap-2 px-4">
              {!isEmpty(reasoning) && (
                <Collapsible defaultOpen className="group flex overflow-hidden flex-col border rounded divide-y">
                  <CollapsibleTrigger className="flex items-center">
                    <span className="font-medium text-sm text-secondary-foreground p-2 rounded-t mr-auto">
                      Reasoning
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground mr-2 group-data-[state=open]:rotate-90 transition-transform duration-200" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="flex flex-1 overflow-hidden max-h-40">
                    <ContentRenderer
                      codeEditorClassName="rounded-b border-none"
                      className="rounded-b border-none"
                      value={reasoning}
                      defaultMode="json"
                    />
                  </CollapsibleContent>
                </Collapsible>
              )}
              <div className="flex flex-col flex-1 overflow-hidden border rounded divide-y">
                <span className="font-medium text-sm text-secondary-foreground p-2 rounded-t">Output</span>
                <div className="flex flex-col flex-1 overflow-hidden">
                  {!isEmpty(toolCalls) ? (
                    text && (
                      <ContentRenderer
                        codeEditorClassName="border-b"
                        className="border-none h-fit border-b"
                        value={text}
                        defaultMode="json"
                      />
                    )
                  ) : (
                    <ContentRenderer
                      codeEditorClassName="rounded-b border-none"
                      className="rounded-b border-none"
                      value={text}
                      defaultMode="json"
                    />
                  )}
                  {!isEmpty(toolCalls) && (
                    <>
                      <span className="flex items-center font-medium text-sm text-secondary-foreground px-2 py-1.5">
                        <Bolt size={12} className="min-w-3 mr-2" /> Tool Calls
                      </span>
                      <ContentRenderer
                        codeEditorClassName="rounded-b"
                        className="rounded-b border-x-0 border-b-0"
                        value={JSON.stringify(toolCalls)}
                        defaultMode="json"
                      />
                    </>
                  )}
                </div>
              </div>
              <Usage usage={usage} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        {history && (
          <>
            <ResizableHandle className="hover:bg-blue-600 active:bg-blue-600" />
            <ResizablePanel minSize={20} defaultSize={30} className="flex flex-col">
              <div className="px-3 py-2 border-b">
                <h3 className="text-sm font-medium">Playground runs history</h3>
              </div>
              <div className="flex overflow-hidden p-2">
                <PlaygroundHistoryTable playgroundId={id} onTraceSelect={onTraceSelect} />
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </>
  );
}
