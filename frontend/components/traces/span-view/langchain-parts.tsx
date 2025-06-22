import React, { memo } from "react";
import { z } from "zod";

import {
  LangChainContentPartSchema,
  LangChainImageUrlPartSchema,
  LangChainMessageSchema,
} from "@/lib/spans/types/langchain";

import { FileContentPart, ImageContentPart, RoleHeader, TextContentPart, ToolCallContentPart } from "./common";

const PureLangChainContentParts = ({
  message,
  presetKey,
}: {
  message: z.infer<typeof LangChainMessageSchema>;
  presetKey?: string;
}) => {
  const getParts = () => {
    switch (message.role) {
      case "system":
      case "user":
      case "human":
        return <LangChainContentPart part={message.content} presetKey={presetKey} />;

      case "tool":
        return (
          <>
            <LangChainContentPart part={message.content} presetKey={presetKey} />
            <TextContentPart
              content={JSON.stringify({ tool_call_id: message.tool_call_id })}
              presetKey={presetKey}
              className="max-h-[400px] border-none"
            />
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
                presetKey={presetKey}
              />
            ))}
            {(message?.invalid_tool_calls || []).map((part, index) => (
              <ToolCallContentPart
                key={`${part.type}-${index}`}
                toolName="Invalid Tool Call"
                content={part}
                presetKey={presetKey}
              />
            ))}
          </>
        );
    }
  };

  return (
    <>
      <RoleHeader role={message.role} />
      {getParts()}
    </>
  );
};

const PureLangChainContentPart = ({
  part,
  presetKey,
}: {
  part: z.infer<typeof LangChainContentPartSchema>;
  presetKey?: string;
}) => {
  if (typeof part === "string") {
    return <TextContentPart content={part} presetKey={presetKey} className="max-h-[400px] border-none" />;
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
            className="max-h-[400px] border-none"
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
            className="max-h-[400px] border-none"
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
              className="max-h-[400px] border-none"
            />
          );
        }
        return (
          <TextContentPart
            key={`${item.type}-${index}`}
            content={item.id}
            presetKey={presetKey}
            className="max-h-[400px] border-none"
          />
        );

      case "audio":
        return (
          <TextContentPart
            key={`${item.type}-${index}`}
            content={JSON.stringify(item)}
            presetKey={presetKey}
            className="max-h-[400px] border-none"
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
