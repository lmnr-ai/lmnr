"use client";
import { debounce, isEmpty } from "lodash";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import useSWR from "swr";

import { LlmProfilesProvider } from "@/components/playground/llm-profiles-context";
import { usePlaygroundOutput } from "@/components/playground/playground-output";
import PlaygroundPanel from "@/components/playground/playground-panel";
import { getDefaultThinkingModelProviderOptions, type LlmRoute } from "@/components/playground/utils";
import TraceView from "@/components/traces/trace-view";
import { Skeleton } from "@/components/ui/skeleton";
import { type LlmProfileOption } from "@/lib/actions/llm-profiles";
import { useToast } from "@/lib/hooks/use-toast";
import { type Message, type Playground as PlaygroundType, type PlaygroundForm } from "@/lib/playground/types";
import { transformFromLegacy } from "@/lib/playground/utils.ts";
import { swrFetcher } from "@/lib/utils";

import Header from "../ui/header";

const defaultMessages: Message[] = [
  {
    role: "user",
    content: [{ type: "text", text: "" }],
  },
];

// Empty when the row has no route (pre-profile playground, or its profile/model was deleted).
const storedRoute = (playground: PlaygroundType): LlmRoute =>
  playground.llmProfileId && playground.llmModel
    ? { llmProfileId: playground.llmProfileId, llmModel: playground.llmModel }
    : { llmProfileId: "", llmModel: "" };

export default function Playground({ playground }: { playground: PlaygroundType }) {
  const { replace } = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  // Trace view state (not synced with URL)
  const [traceId, setTraceId] = useState<string | null>(null);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(false);

  const methods = useForm<PlaygroundForm>({
    defaultValues: {
      llmProfileId: "",
      llmModel: "",
      messages: defaultMessages,
      maxTokens: 1024,
      temperature: 1,
      providerOptions: {},
    },
    mode: "onChange",
  });

  const { reset, watch } = methods;
  const { reset: resetOutput } = usePlaygroundOutput();
  const { data: profiles, isLoading: isProfilesLoading } = useSWR<LlmProfileOption[]>(
    `/api/projects/${params?.projectId}/llm-profiles`,
    swrFetcher
  );

  const updatePlaygroundData = useCallback(
    async (form: PlaygroundForm, id: string, projectId?: string) => {
      try {
        setIsUpdating(true);
        const hasRoute = !!form.llmProfileId && !!form.llmModel;
        await fetch(`/api/projects/${projectId}/playgrounds/${id}`, {
          method: "POST",
          body: JSON.stringify({
            promptMessages: form.messages,
            llmProfileId: hasRoute ? form.llmProfileId : null,
            llmModel: hasRoute ? form.llmModel : null,
            tools: form.tools,
            toolChoice: form.toolChoice,
            maxTokens: form.maxTokens,
            temperature: form.temperature,
            providerOptions: form.providerOptions,
            outputSchema: form.structuredOutput,
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

  // Default provider options depend on the route's profile, so the form is filled once profiles
  // first arrive; SWR revalidations must not reset edits made since.
  const initialized = useRef(false);
  useEffect(() => {
    if (!profiles || initialized.current) return;
    initialized.current = true;
    const route = storedRoute(playground);
    const provider = profiles.find((p) => p.id === route.llmProfileId)?.provider;
    reset({
      ...route,
      messages: isEmpty(playground.promptMessages) ? defaultMessages : transformFromLegacy(playground.promptMessages),
      maxTokens: playground.maxTokens ?? undefined,
      temperature: playground.temperature ?? undefined,
      providerOptions:
        !isEmpty(playground.providerOptions) && playground.providerOptions
          ? playground.providerOptions
          : getDefaultThinkingModelProviderOptions(provider, route.llmModel),
      tools: JSON.stringify(playground.tools),
      toolChoice: playground.toolChoice as PlaygroundForm["toolChoice"],
      structuredOutput: playground.outputSchema ?? undefined,
    });
    resetOutput();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);

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

  useEffect(() => {
    setIsSidePanelOpen(traceId != null);
  }, [traceId]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header path={`playgrounds/${playground.name}`}>
        {isUpdating && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
      </Header>
      {isProfilesLoading ? (
        <div className="flex flex-col gap-4 py-4 px-4">
          <Skeleton className="w-64 h-8" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="w-full h-64" />
            <Skeleton className="w-full h-64" />
          </div>
          <Skeleton className="w-16 h-7" />
        </div>
      ) : (
        <LlmProfilesProvider profiles={profiles ?? []}>
          <FormProvider {...methods}>
            <PlaygroundPanel id={playground.id} onTraceSelect={setTraceId} />
          </FormProvider>
        </LlmProfilesProvider>
      )}
      {isSidePanelOpen && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
          <Resizable
            enable={{
              left: true,
            }}
            defaultSize={{
              width: "65vw",
            }}
          >
            <TraceView
              onClose={() => {
                setIsSidePanelOpen(false);
                setTraceId(null);
              }}
              traceId={traceId!}
            />
          </Resizable>
        </div>
      )}
    </div>
  );
}
