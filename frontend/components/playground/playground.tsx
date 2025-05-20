"use client";
import { debounce, isEmpty } from "lodash";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import useSWR from "swr";

import PlaygroundPanel from "@/components/playground/playground-panel";
import { getDefaultThinkingModelProviderOptions } from "@/components/playground/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast";
import { Message, Playground as PlaygroundType, PlaygroundForm } from "@/lib/playground/types";
import { ProviderApiKey } from "@/lib/settings/types";
import { swrFetcher } from "@/lib/utils";

import Header from "../ui/header";

const defaultMessages: Message[] = [
  {
    role: "user",
    content: [{ type: "text", text: "" }],
  },
];

export default function Playground({ playground }: { playground: PlaygroundType }) {
  const { replace } = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const methods = useForm<PlaygroundForm>({
    defaultValues: {
      model: "openai:gpt-4o-mini",
      messages: defaultMessages,
      maxTokens: 1024,
      temperature: 1,
      providerOptions: {},
    },
    mode: "onChange",
  });

  const { reset, watch } = methods;

  const { data: apiKeys, isLoading: isApiKeysLoading } = useSWR<ProviderApiKey[]>(
    `/api/projects/${params?.projectId}/provider-api-keys`,
    swrFetcher
  );

  const handleResetForm = async () => {
    if (playground) {
      reset({
        model: playground.modelId as PlaygroundForm["model"],
        messages: isEmpty(playground.promptMessages) ? defaultMessages : playground.promptMessages,
        maxTokens: playground.maxTokens ?? undefined,
        temperature: playground.temperature ?? undefined,
        providerOptions: playground.providerOptions
          ? playground.providerOptions
          : getDefaultThinkingModelProviderOptions(playground.modelId as PlaygroundForm["model"]),
        tools: JSON.stringify(playground.tools),
        toolChoice: playground.toolChoice as PlaygroundForm["toolChoice"],
      });
    }
  };

  const updatePlaygroundData = useCallback(
    async (form: PlaygroundForm, id: string, projectId?: string) => {
      try {
        setIsUpdating(true);
        await fetch(`/api/projects/${projectId}/playgrounds/${id}`, {
          method: "POST",
          body: JSON.stringify({
            promptMessages: form.messages,
            modelId: form.model,
            tools: form.tools,
            toolChoice: form.toolChoice,
            maxTokens: form.maxTokens,
            temperature: form.temperature,
            providerOptions: form.providerOptions,
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
    handleResetForm();
  }, []);

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
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header path={`playgrounds/${playground.name}`}>
        {isUpdating && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
      </Header>
      {isApiKeysLoading ? (
        <div className="flex flex-col gap-4 py-4 px-4">
          <Skeleton className="w-64 h-8" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="w-full h-64" />
            <Skeleton className="w-full h-64" />
          </div>
          <Skeleton className="w-16 h-7" />
        </div>
      ) : (
        <FormProvider {...methods}>
          <PlaygroundPanel id={playground.id} apiKeys={apiKeys ?? []} />
        </FormProvider>
      )}
    </div>
  );
}
