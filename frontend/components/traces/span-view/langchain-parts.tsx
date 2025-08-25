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
  spanPath,
  type,
  parentIndex,
}: {
  message: z.infer<typeof LangChainMessageSchema>;
  spanPath: string;
  parentIndex: number;
  type: "input" | "output";
}) => {
  switch (message.role) {
    case "system":
    case "user":
    case "human":
      return <LangChainContentPart type={type} spanPath={spanPath} parentIndex={parentIndex} part={message.content} />;

    case "tool":
      return (
        <>
          <ToolResultContentPart
            toolCallId={message?.tool_call_id || "-"}
            content={message.content}
            type={type}
            presetKey={`${parentIndex}-tool-0-${spanPath}`}
          >
            <LangChainContentPart part={message.content} spanPath={spanPath} type={type} parentIndex={parentIndex} />
          </ToolResultContentPart>
        </>
      );
    case "assistant":
    case "ai":
      return (
        <>
          <LangChainContentPart part={message.content} spanPath={spanPath} type={type} parentIndex={parentIndex} />
          {(message?.tool_calls || []).map((part, index) => (
            <ToolCallContentPart
              key={`${parentIndex}-tool-${index}-${spanPath}`}
              toolName={part.name}
              content={part}
              type={type}
              presetKey={`${parentIndex}-tool-${index}-${spanPath}`}
            />
          ))}
          {(message?.invalid_tool_calls || []).map((part, index) => (
            <ToolCallContentPart
              key={`${parentIndex}-tool-${index}-${spanPath}`}
              content={part}
              type={type}
              presetKey={`${parentIndex}-tool-${index}-${spanPath}`}
              toolName="Invalid Tool Call"
            />
          ))}
        </>
      );
  }
};

const PureLangChainContentPart = ({
  part,
  spanPath,
  parentIndex,
  type,
}: {
  part: z.infer<typeof LangChainContentPartSchema> | null;
  spanPath: string;
  parentIndex: number;
  type: "input" | "output";
}) => {
  if (typeof part === "string" || !part) {
    return (
      <TextContentPart
        content={part || JSON.stringify(part)}
        presetKey={`${parentIndex}-text-0-${spanPath}`}
        type={type}
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
            key={`${parentIndex}-${item.type}-${index}-${spanPath}`}
            content={item.text}
            type={type}
            presetKey={`${parentIndex}-${item.type}-${index}-${spanPath}`}
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
            key={`${parentIndex}-${item.type}-${index}-${spanPath}`}
            content={item.id}
            type={type}
            presetKey={`${parentIndex}-${item.type}-${index}-${spanPath}`}
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
              key={`${parentIndex}-${item.type}-${index}-${spanPath}`}
              content={item.text}
              type={type}
              presetKey={`${parentIndex}-${item.type}-${index}-${spanPath}`}
              className="max-h-[400px] border-0"
            />
          );
        }
        return (
          <TextContentPart
            key={`${parentIndex}-${item.type}-${index}-${spanPath}`}
            content={item.id}
            type={type}
            presetKey={`${parentIndex}-${item.type}-${index}-${spanPath}`}
            className="max-h-[400px] border-0"
          />
        );

      case "audio":
        return (
          <TextContentPart
            key={`${parentIndex}-${item.type}-${index}-${spanPath}`}
            content={JSON.stringify(item)}
            type={type}
            presetKey={`${parentIndex}-${item.type}-${index}-${spanPath}`}
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
