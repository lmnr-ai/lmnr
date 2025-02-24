"use client";
import { debounce, isEmpty } from "lodash";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import useSWR from "swr";

import PlaygroundPanel from "@/components/playground/playground-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast";
import { Message, Playground as PlaygroundType, PlaygroundForm } from "@/lib/playground/types";
import { mapMessages, remapMessages } from "@/lib/playground/utils";
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
    },
  });

  const { reset, watch } = methods;

  const { data: apiKeys, isLoading: isApiKeysLoading } = useSWR<ProviderApiKey[]>(
    `/api/projects/${params?.projectId}/provider-api-keys`,
    swrFetcher
  );

  const handleResetForm = async () => {
    if (playground) {
      const messages = await mapMessages(playground.promptMessages);

      reset({
        model: (playground.modelId as PlaygroundForm["model"]) ?? "openai:gpt-4o-mini",
        messages: isEmpty(messages) ? defaultMessages : messages,
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
    <div className="h-full flex flex-col">
      <Header path={`playgrounds/${playground.name}`}>
        {isUpdating && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
      </Header>
      {isApiKeysLoading ? (
        <div className="flex flex-col gap-4 py-8 px-4">
          <Skeleton className="w-64 h-8" />
          <Skeleton className="w-full h-32" />
          <Skeleton className="w-16 h-7" />
        </div>
      ) : (
        <FormProvider {...methods}>
          <PlaygroundPanel apiKeys={apiKeys ?? []} isUpdating={isUpdating} />
        </FormProvider>
      )}
    </div>
  );
}
