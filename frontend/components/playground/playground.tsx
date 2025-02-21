"use client";
import { debounce, isEmpty } from "lodash";
import { Loader2, PlayIcon } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Controller, FormProvider, SubmitHandler, useForm } from "react-hook-form";

import Messages from "@/components/playground/messages";
import { useToast } from "@/lib/hooks/use-toast";
import { Message, Playground as PlaygroundType, PlaygroundForm } from "@/lib/playground/types";
import { mapMessages, parseSystemMessages, remapMessages } from "@/lib/playground/utils";
import { streamReader } from "@/lib/utils";

import { Button } from "../ui/button";
import Formatter from "../ui/formatter";
import Header from "../ui/header";
import { ScrollArea } from "../ui/scroll-area";
import LlmSelect from "./messages/llm-select";

const defaultMessages: Message[] = [
  {
    role: "user",
    content: [{ type: "text", text: "" }],
  },
];

const renderText = (text: string, inputs: Record<string, string>) =>
  text.replace(/\{\{([^}]+)\}\}/g, (match, p1) => inputs[p1] || match);

const renderMessages = (messages: Message[], inputs: Record<string, string>): Message[] =>
  messages.map((message) => ({
    ...message,
    content: message.content.map((content) =>
      content.type === "text"
        ? {
          ...content,
          text: renderText(content.text, inputs),
        }
        : content
    ),
  }));

export default function Playground({ playground }: { playground: PlaygroundType }) {
  const { replace } = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [inputs, setInputs] = useState<string>("{}");
  const [output, setOutput] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  const methods = useForm<PlaygroundForm>({
    defaultValues: {
      model: "openai:gpt-4o-mini",
      messages: isEmpty(playground.promptMessages) ? defaultMessages : mapMessages(playground.promptMessages),
    },
  });

  const { control, handleSubmit, watch } = methods;
  const submit: SubmitHandler<PlaygroundForm> = async (form) => {
    try {
      setIsLoading(true);
      setOutput("");
      const inputValues: Record<string, any> = JSON.parse(inputs);

      const response = await fetch(`/api/projects/${params?.projectId}/chat`, {
        method: "POST",
        body: JSON.stringify({
          model: form.model,
          messages: parseSystemMessages(renderMessages(form.messages, inputValues)),
        }),
      });

      const stream = response.body?.pipeThrough(new TextDecoderStream());

      if (!stream) {
        throw new Error("No stream found.");
      }

      await streamReader(stream, (chunk) => {
        setOutput((prev) => prev + chunk);
      });
    } catch (e) {
      if (e instanceof Error) {
        toast({ title: e.message, variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const updatePlaygroundData = useCallback(
    async (form: PlaygroundForm, id: string, projectId?: string) => {
      try {
        setIsUpdating(true);
        await fetch(`/api/projects/${projectId}/playgrounds/${id}`, {
          method: "POST",
          body: JSON.stringify({
            promptMessages: remapMessages(form.messages),
            modelId: form.model,
          }),
        });
      } catch (e) {
        if (e instanceof Error) {
          toast({ title: e.message, variant: "destructive" });
        }
      } finally {
        setIsUpdating(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (params.playgroundId === "create" && searchParams.get("spanId")) {
      replace(`/project/${params?.projectId}/playgrounds/${playground.id}`);
    }
  }, [params.playgroundId, params?.projectId, playground.id, replace, searchParams]);

  useEffect(() => {
    if (!params?.projectId) return;

    const debouncedUpdate = debounce((form: PlaygroundForm) => {
      updatePlaygroundData(form, playground.id, String(params.projectId));
    }, 300);

    const subscription = watch((form) => {
      debouncedUpdate(form as PlaygroundForm);
    });

    return () => {
      debouncedUpdate.cancel();
      subscription.unsubscribe();
    };
  }, [params?.projectId, playground.id, updatePlaygroundData, watch]);

  return (
    <div className="h-full flex flex-col">
      <Header path={`playgrounds/${playground.name}`}>
        {isUpdating && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
      </Header>
      <ScrollArea className="flex-grow overflow-auto">
        <div className="max-h-0">
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2"></div>
            <FormProvider {...methods}>
              <Controller
                render={({ field: { value, onChange } }) => <LlmSelect value={value} onChange={onChange} />}
                name="model"
                control={control}
              />
              <Messages />
            </FormProvider>
          </div>
          <div className="px-4">
            <Button onClick={handleSubmit(submit)} disabled={isUpdating || isLoading}>
              {isUpdating || isLoading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <PlayIcon className="w-4 h-4 mr-1" />
              )}
              Run
            </Button>
          </div>
          <div className="flex flex-col gap-2 p-4">
            <div className="flex gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <div className="text-sm font-medium">Inputs</div>
                <Formatter
                  value={inputs}
                  onChange={(value) => {
                    setInputs(value);
                  }}
                  editable={true}
                  defaultMode="json"
                />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <div className="text-sm font-medium">Output</div>
                <Formatter value={output} editable={false} defaultMode="json" />
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
