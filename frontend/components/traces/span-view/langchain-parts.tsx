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
  parentIndex,
}: {
  message: z.infer<typeof LangChainMessageSchema>;
  parentIndex: number;
  presetKey: string;
}) => {
  switch (message.role) {
    case "system":
    case "user":
    case "human":
      return (
        <LangChainContentPart presetKey={presetKey} parentIndex={parentIndex} part={message.content} messageIndex={parentIndex} />
      );

    case "tool":
      return (
        <>
          <ToolResultContentPart
            toolCallId={message?.tool_call_id || "-"}
            content={message.content}
            presetKey={`${parentIndex}-tool-0-${presetKey}`}
          >
            <LangChainContentPart part={message.content} presetKey={presetKey} parentIndex={parentIndex} messageIndex={parentIndex} />
          </ToolResultContentPart>
        </>
      );
    case "assistant":
    case "ai":
      return (
        <>
          <LangChainContentPart part={message.content} presetKey={presetKey} parentIndex={parentIndex} messageIndex={parentIndex} />
          {(message?.tool_calls || []).map((part, index) => (
            <ToolCallContentPart
              key={`${parentIndex}-tool-${index}-${presetKey}`}
              toolName={part.name}
              content={part}
              presetKey={`${parentIndex}-tool-${index}-${presetKey}`}
              messageIndex={parentIndex}
              contentPartIndex={index}
            />
          ))}
          {(message?.invalid_tool_calls || []).map((part, index) => (
            <ToolCallContentPart
              key={`${parentIndex}-tool-${index}-${presetKey}`}
              content={part}
              presetKey={`${parentIndex}-tool-${index}-${presetKey}`}
              toolName="Invalid Tool Call"
              messageIndex={parentIndex}
              contentPartIndex={(message?.tool_calls || []).length + index}
            />
          ))}
        </>
      );
  }
};

const PureLangChainContentPart = ({
  part,
  presetKey,
  parentIndex,
  messageIndex = 0,
}: {
  part: z.infer<typeof LangChainContentPartSchema> | null;
  parentIndex: number;
  presetKey: string;
  messageIndex?: number;
}) => {
  if (typeof part === "string" || !part) {
    return (
      <TextContentPart
        content={part || JSON.stringify(part)}
        presetKey={`${parentIndex}-text-0-${presetKey}`}
        className="max-h-[400px] border-0"
        messageIndex={messageIndex}
        contentPartIndex={0}
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
            key={`${parentIndex}-${item.type}-${index}-${presetKey}`}
            content={item.text}
            presetKey={`${parentIndex}-${item.type}-${index}-${presetKey}`}
            className="max-h-[400px] border-0"
            messageIndex={messageIndex}
            contentPartIndex={index}
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
            key={`${parentIndex}-${item.type}-${index}-${presetKey}`}
            content={item.id}
            presetKey={`${parentIndex}-${item.type}-${index}-${presetKey}`}
            className="max-h-[400px] border-0"
            messageIndex={messageIndex}
            contentPartIndex={index}
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
              key={`${parentIndex}-${item.type}-${index}-${presetKey}`}
              content={item.text}
              presetKey={`${parentIndex}-${item.type}-${index}-${presetKey}`}
              className="max-h-[400px] border-0"
              messageIndex={messageIndex}
              contentPartIndex={index}
            />
          );
        }
        return (
          <TextContentPart
            key={`${parentIndex}-${item.type}-${index}-${presetKey}`}
            content={item.id}
            presetKey={`${parentIndex}-${item.type}-${index}-${presetKey}`}
            className="max-h-[400px] border-0"
            messageIndex={messageIndex}
            contentPartIndex={index}
          />
        );

      case "audio":
        return (
          <TextContentPart
            key={`${parentIndex}-${item.type}-${index}-${presetKey}`}
            content={JSON.stringify(item)}
            presetKey={`${parentIndex}-${item.type}-${index}-${presetKey}`}
            className="max-h-[400px] border-0"
            messageIndex={messageIndex}
            contentPartIndex={index}
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
