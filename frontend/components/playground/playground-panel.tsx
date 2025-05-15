"use client";
import { processDataStream, ToolCall, ToolResult } from "ai";
import { isEmpty } from "lodash";
import { Loader2, PlayIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Controller, ControllerRenderProps, SubmitHandler, useFormContext } from "react-hook-form";
import { useHotkeys } from "react-hotkeys-hook";

import Messages from "@/components/playground/messages";
import LlmSelect from "@/components/playground/messages/llm-select";
import ParamsPopover from "@/components/playground/messages/params-popover";
import ToolsDialog from "@/components/playground/messages/tools-dialog";
import ProvidersAlert from "@/components/playground/providers-alert";
import { Provider } from "@/components/playground/types";
import { getDefaultThinkingModelProviderOptions } from "@/components/playground/utils";
import CodeHighlighter from "@/components/traces/code-highlighter";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useToast } from "@/lib/hooks/use-toast";
import { PlaygroundForm } from "@/lib/playground/types";
import { parseSystemMessages } from "@/lib/playground/utils";
import { ProviderApiKey } from "@/lib/settings/types";
import { cn } from "@/lib/utils";

export default function PlaygroundPanel({ id, apiKeys }: { id: string; apiKeys: ProviderApiKey[] }) {
  const params = useParams();
  const { toast } = useToast();
  const [output, setOutput] = useState<{ text: string; reasoning: string; toolCalls: string[] }>({
    text: "",
    reasoning: "",
    toolCalls: [],
  });
  const [usage, setUsage] = useState<{
    promptTokens: number;
    completionTokens: number;
  }>();
  const [isLoading, setIsLoading] = useState(false);

  const { control, handleSubmit, setValue } = useFormContext<PlaygroundForm>();

  const appendToolCalls = (value: ToolCall<any, any> | Partial<ToolResult<any, any, any>>) => {
    setOutput((prev) => ({
      ...prev,
      toolCalls: [...prev.toolCalls, JSON.stringify(value)],
    }));
  };

  console.log(usage);
  const submit: SubmitHandler<PlaygroundForm> = async (form) => {
    try {
      setIsLoading(true);
      setUsage(undefined);
      setOutput({ text: "", reasoning: "", toolCalls: [] });

      const response = await fetch(`/api/projects/${params?.projectId}/chat`, {
        method: "POST",
        body: JSON.stringify({
          projectId: params?.projectId,
          model: form.model,
          maxTokens: form.maxTokens,
          temperature: form.temperature,
          messages: parseSystemMessages(form.messages),
          providerOptions: form.providerOptions,
          tools: form.tools,
          toolChoice: form.toolChoice,
        }),
      });

      if (!response.body) {
        throw new Error("No stream found.");
      }

      await processDataStream({
        stream: response.body,
        onErrorPart: (value) => {
          toast({ variant: "destructive", title: "Error", description: value });
        },
        onTextPart: (value) => {
          setOutput((prev) => ({
            ...prev,
            text: prev.text + value,
          }));
        },
        onFinishMessagePart: (part) => {
          console.log(part);
          if (part?.usage) {
            setUsage(part.usage);
          }
        },
        onReasoningPart: (value) => {
          setOutput((prev) => ({
            ...prev,
            reasoning: prev.reasoning + value,
          }));
        },
        onToolCallPart: appendToolCalls,
        onToolResultPart: appendToolCalls,
        onToolCallDeltaPart: appendToolCalls,
      });
    } catch (e) {
      if (e instanceof Error) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
    }
  };

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
      output.reasoning && `<thinking>\n\n${output.reasoning}\n\n</thinking>`,
      output.toolCalls?.length > 0 && `<tool_calls>\n\n${output.toolCalls.join("\n\n")}\n\n</tool_calls>`,
      output.text,
    ].filter(Boolean);

    return sections.join("\n\n");
  }, [output]);

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
        <ToolsDialog />
        <Button disabled={isLoading} onClick={handleSubmit(submit)} className="ml-auto h-8 w-fit px-2">
          {isLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlayIcon className="w-4 h-4 mr-1" />}
          <span className="mr-2">Run</span>
          <div className="text-center text-xs opacity-75">⌘ + ⏎</div>
        </Button>
      </div>
      <ResizablePanelGroup autoSaveId={`playground:${id}`} direction="horizontal" className="flex-1 pb-4">
        <ResizablePanel minSize={30} className="flex flex-col flex-1 gap-2">
          <Messages />
        </ResizablePanel>
        <ResizableHandle className="hover:bg-blue-600 active:bg-blue-600" />
        <ResizablePanel minSize={20} className="h-full flex flex-col px-4">
          <div className="flex flex-1">
            <CodeHighlighter
              codeEditorClassName="rounded-b"
              className="rounded"
              value={structuredOutput}
              defaultMode="json"
            />
          </div>
          {!!usage && (
            <div className={cn("mt-2 flex flex-col gap-1")}>
              <span className="text-xs text-secondary-foreground">Prompt Tokens: {usage?.promptTokens}</span>
              <span className="text-xs text-secondary-foreground">Completion Tokens: {usage?.completionTokens}</span>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}
