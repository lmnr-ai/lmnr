"use client";
import { Loader2, PlayIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, FormProvider, SubmitHandler, useForm } from "react-hook-form";

import Messages from "@/components/playground/messages";
import { useToast } from "@/lib/hooks/use-toast";
import { Playground as PlaygroundType, PlaygroundForm } from "@/lib/playground/types";
import { streamReader } from "@/lib/utils";

import { Button } from "../ui/button";
import Formatter from "../ui/formatter";
import Header from "../ui/header";
import { ScrollArea } from "../ui/scroll-area";
import LlmSelect from "./messages/llm-select";

export default function Playground({ playground }: { playground: PlaygroundType }) {
  const params = useParams();
  const { toast } = useToast();

  const [inputs, setInputs] = useState<string>("{}");
  const [output, setOutput] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    setIsUpdating(true);

    timer = setTimeout(() => {
      fetch(`/api/projects/${params?.projectId}/playgrounds/${playground.id}`, {
        method: "POST",
        body: JSON.stringify({
          promptMessages: playground.promptMessages,
          modelId: playground.modelId,
        }),
      })
        .then((res) => res.json())
        .then(() => {
          setIsUpdating(false);
        });
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [params?.projectId, playground.id, playground.modelId, playground.promptMessages]);

  const methods = useForm<PlaygroundForm>({
    defaultValues: {
      model: "openai:gpt-4o-mini",
      messages: [],
    },
  });

  const { control, handleSubmit } = methods;
  const submit: SubmitHandler<PlaygroundForm> = async (form) => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          model: form.model,
          messages: form.messages,
        }),
      });

      const stream = response.body?.pipeThrough(new TextDecoderStream());

      if (!stream) return;

      await streamReader(stream, (chunk) => {
        setOutput((prev) => prev + chunk);
      });
    } catch (e) {
      if (e instanceof Error) {
        toast({ title: "Error occured.", variant: "destructive", description: e.message });
      }
    } finally {
      setIsLoading(false);
    }
  };

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
