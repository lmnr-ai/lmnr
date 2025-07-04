import React, { memo } from "react";
import { z } from "zod/v4";

import {
  LangChainContentPartSchema,
  LangChainImageUrlPartSchema,
  LangChainMessageSchema,
} from "@/lib/spans/types/langchain";

import {
  FileContentPart,
  ImageContentPart,
  TextContentPart,
  ToolCallContentPart,
  ToolResultContentPart,
} from "./common";

const PureLangChainContentParts = ({
  message,
  presetKey,
}: {
  message: z.infer<typeof LangChainMessageSchema>;
  presetKey?: string;
}) => {
  switch (message.role) {
    case "system":
    case "user":
    case "human":
      return <LangChainContentPart part={message.content} presetKey={presetKey} />;

    case "tool":
      return (
        <>
          <ToolResultContentPart
            toolCallId={message?.tool_call_id || "-"}
            content={message.content}
            presetKey={presetKey}
          >
            <LangChainContentPart part={message.content} presetKey={presetKey} />
          </ToolResultContentPart>
        </>
      );
    case "assistant":
    case "ai":
      return (
        <>
          <LangChainContentPart part={message.content} presetKey={presetKey} />
          {(message?.tool_calls || []).map((part, index) => (
            <ToolCallContentPart
              key={`${part.type}-${index}`}
              toolName={part.name}
              content={part}
              presetKey={`${presetKey}-${index}`}
            />
          ))}
          {(message?.invalid_tool_calls || []).map((part, index) => (
            <ToolCallContentPart
              key={`${part.type}-${index}`}
              toolName="Invalid Tool Call"
              content={part}
              presetKey={`${presetKey}-${index}`}
            />
          ))}
        </>
      );
  }
};

const PureLangChainContentPart = ({
  part,
  presetKey,
}: {
  part: z.infer<typeof LangChainContentPartSchema> | null;
  presetKey?: string;
}) => {
  if (typeof part === "string" || !part) {
    return (
      <TextContentPart
        content={part || JSON.stringify(part)}
        presetKey={presetKey}
        className="max-h-[400px] border-0"
      />
    );
  }

  return part.map((item, index) => {
    switch (item.type) {
      case "image_url":
        return <LangChainImageContentPart key={`${item.type}-${index}`} part={item} />;
      case "text":
        return (
          <TextContentPart
            key={`${item.type}-${index}`}
            content={item.text}
            presetKey={presetKey}
            className="max-h-[400px] border-0"
          />
        );
      case "image":
        if ("data" in item) {
          return <ImageContentPart key={`${item.type}-${index}`} src={item.data} />;
        }
        if ("url" in item) {
          return <ImageContentPart key={`${item.type}-${index}`} src={item.url} />;
        }
        return (
          <TextContentPart
            key={`${item.type}-${index}`}
            content={item.id}
            presetKey={presetKey}
            className="max-h-[400px] border-0"
          />
        );

      case "file":
        if ("data" in item) {
          return <FileContentPart key={`${item.type}-${index}`} data={item.data} />;
        }
        if ("url" in item) {
          return <FileContentPart key={`${item.type}-${index}`} data={item.url} />;
        }
        if ("text" in item) {
          return (
            <TextContentPart
              key={`${item.type}-${index}`}
              content={item.text}
              presetKey={presetKey}
              className="max-h-[400px] border-0"
            />
          );
        }
        return (
          <TextContentPart
            key={`${item.type}-${index}`}
            content={item.id}
            presetKey={presetKey}
            className="max-h-[400px] border-0"
          />
        );

      case "audio":
        return (
          <TextContentPart
            key={`${item.type}-${index}`}
            content={JSON.stringify(item)}
            presetKey={presetKey}
            className="max-h-[400px] border-0"
          />
        );

      default:
        return null;
    }
  });
};

const PureLangChainImageContentPart = ({ part }: { part: z.infer<typeof LangChainImageUrlPartSchema> }) => {
  const imageUrl = typeof part.image_url === "string" ? part.image_url : part.image_url.url;
  return <ImageContentPart src={imageUrl} />;
};

const LangChainImageContentPart = memo(PureLangChainImageContentPart);
const LangChainContentPart = memo(PureLangChainContentPart);
const LangChainContentParts = memo(PureLangChainContentParts);

export default LangChainContentParts;
