import { isArray } from "lodash";
import { z } from "zod/v4";

import { LangChainMessagesSchema } from "@/lib/spans/types/langchain";
import { OpenAIMessagesSchema } from "@/lib/spans/types/openai";
import { ChatMessage, ChatMessageContentPart } from "@/lib/types";

type TraceVisibility = "private" | "public";

export const getTransformPatterns = (
  projectId: string
): Record<TraceVisibility, { pattern: RegExp; replacement: string }> => ({
  public: {
    pattern: new RegExp(`/api/projects/${projectId}/payloads/([^/\\s"]+)`, "g"),
    replacement: "/api/shared/payloads/$1",
  },
  private: {
    pattern: new RegExp(`/api/shared/payloads/([^/\\s"]+)`, "g"),
    replacement: `/api/projects/${projectId}/payloads/$1`,
  },
});

const transformUrl = (url: string, projectId: string, direction: TraceVisibility) => {
  const { pattern, replacement } = getTransformPatterns(projectId)[direction];

  const transformedUrl = url.replace(pattern, replacement);
  const match = url.match(pattern);

  return {
    url: transformedUrl,
    payloadId: match?.[1],
  };
};

export const transformMessages = (
  content: any,
  projectId: string,
  direction: TraceVisibility
): { messages: any; payloads: Set<string> } => {
  const payloads = new Set<string>();

  if (!content) return { messages: content, payloads };

  if (isArray(content)) {
    const openAIParsed = OpenAIMessagesSchema.safeParse(content);
    if (openAIParsed.success) {
      return {
        messages: transformOpenAIMessages(openAIParsed.data, projectId, direction, payloads),
        payloads,
      };
    }

    const langChainParsed = LangChainMessagesSchema.safeParse(content);
    if (langChainParsed.success) {
      return {
        messages: transformLangChainMessages(langChainParsed.data, projectId, direction, payloads),
        payloads,
      };
    }

    try {
      return {
        messages: transformChatMessages(content as ChatMessage[], projectId, direction, payloads),
        payloads,
      };
    } catch {
      return {
        messages: content,
        payloads,
      };
    }
  }

  return {
    messages: content,
    payloads,
  };
};

const transformChatMessages = (
  messages: ChatMessage[],
  projectId: string,
  direction: TraceVisibility,
  payloads: Set<string>
): ChatMessage[] =>
  messages.map((message) => {
    if (isArray(message.content)) {
      const transformedContent = message.content.map((part: ChatMessageContentPart) => {
        switch (part.type) {
          case "image_url":
            if ("url" in part) {
              const { url, payloadId } = transformUrl(part.url, projectId, direction);
              if (payloadId) payloads.add(payloadId);

              return {
                ...part,
                url,
              };
            }
            if ("image_url" in part && part.image_url?.url) {
              const { url, payloadId } = transformUrl(part.image_url.url, projectId, direction);
              if (payloadId) payloads.add(payloadId);

              return {
                ...part,
                image_url: {
                  ...part.image_url,
                  url,
                },
              };
            }
            return part;

          default:
            return part;
        }
      });

      return {
        ...message,
        content: transformedContent,
      };
    }

    return message;
  });

const transformLangChainMessages = (
  messages: z.infer<typeof LangChainMessagesSchema>,
  projectId: string,
  direction: TraceVisibility,
  payloads: Set<string>
): z.infer<typeof LangChainMessagesSchema> =>
  messages.map((message) => {
    if ((message.role === "human" || message.role === "user") && isArray(message.content)) {
      const transformedContent = message.content.map((part) => {
        if ("type" in part && part.type === "image_url") {
          if (typeof part.image_url === "string") {
            const { url, payloadId } = transformUrl(part.image_url, projectId, direction);
            if (payloadId) payloads.add(payloadId);

            return {
              ...part,
              image_url: url,
            };
          } else if (part.image_url && typeof part.image_url === "object" && "url" in part.image_url) {
            const { url, payloadId } = transformUrl(part.image_url.url, projectId, direction);
            if (payloadId) payloads.add(payloadId);

            return {
              ...part,
              image_url: {
                ...part.image_url,
                url,
              },
            };
          }
        }

        if ("source_type" in part && part.source_type === "url" && "url" in part) {
          const { url, payloadId } = transformUrl(part.url, projectId, direction);
          if (payloadId) payloads.add(payloadId);

          return {
            ...part,
            url,
          };
        }

        return part;
      });

      return {
        ...message,
        content: transformedContent,
      };
    }

    return message;
  });

const transformOpenAIMessages = (
  messages: z.infer<typeof OpenAIMessagesSchema>,
  projectId: string,
  direction: TraceVisibility,
  payloads: Set<string>
): z.infer<typeof OpenAIMessagesSchema> =>
  messages.map((message) => {
    if (message.role === "user" && isArray(message.content)) {
      const transformedContent = message.content.map((part) => {
        if (part.type === "image_url") {
          const { url, payloadId } = transformUrl(part.image_url.url, projectId, direction);
          console.log("here are payloads brother", part, url, payloadId);
          if (payloadId) payloads.add(payloadId);

          return {
            ...part,
            image_url: {
              ...part.image_url,
              url,
            },
          };
        }
        return part;
      });

      return {
        ...message,
        content: transformedContent,
      };
    }

    return message;
  });
