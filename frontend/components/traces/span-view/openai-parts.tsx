import React, { memo } from "react";
import { z } from "zod/v4";

import {
  OpenAIFilePartSchema,
  OpenAIImagePartSchema,
  OpenAIMessageSchema,
  OpenAITextPartSchema,
  OpenAIToolCallPartSchema,
} from "@/lib/spans/types/openai";

import {
  FileContentPart,
  ImageContentPart,
  TextContentPart,
  ToolCallContentPart,
  ToolResultContentPart,
} from "./common";

const PureOpenAIImageContentPart = ({ part }: { part: z.infer<typeof OpenAIImagePartSchema> }) => (
  <ImageContentPart src={part.image_url.url} />
);

const PureOpenAIFileContentPart = ({ part }: { part: z.infer<typeof OpenAIFilePartSchema> }) => {
  if (typeof part.file.file_data === "string") {
    return <FileContentPart data={part.file.file_data} filename={part.file.filename || "-"} />;
  }
  return null;
};

const PureOpenAITextContentPart = ({
  part,
  type,
  presetKey,
}: {
  part: z.infer<typeof OpenAITextPartSchema> | string;
  type: "input" | "output";
  presetKey: string;
}) => {
  const content = typeof part === "string" ? part : part.text;
  return <TextContentPart type={type} content={content} presetKey={presetKey} />;
};

const PureOpenAIToolCallContentPart = ({
  part,
  type,
  presetKey,
}: {
  part: z.infer<typeof OpenAIToolCallPartSchema>;
  type: "input" | "output";
  presetKey: string;
}) => <ToolCallContentPart toolName={part.function.name} type={type} content={part} presetKey={presetKey} />;

const OpenAIImageContentPart = memo(PureOpenAIImageContentPart);
const OpenAIFileContentPart = memo(PureOpenAIFileContentPart);
const OpenAITextContentPart = memo(PureOpenAITextContentPart);
const OpenAIToolCallContentPart = memo(PureOpenAIToolCallContentPart);

const PureOpenAIContentParts = ({
  message,
  parentIndex,
  type,
  spanPath,
}: {
  message: z.infer<typeof OpenAIMessageSchema>;
  spanPath: string;
  parentIndex: number;
  type: "input" | "output";
}) => {
  switch (message.role) {
    case "system":
      return typeof message.content === "string" ? (
        <OpenAITextContentPart type={type} part={message.content} presetKey={`${parentIndex}-text-0-${spanPath}`} />
      ) : (
        (message.content || []).map((part, index) => (
          <OpenAITextContentPart
            type={type}
            presetKey={`${parentIndex}-text-${index}-${spanPath}`}
            key={`${parentIndex}-text-${index}-${spanPath}`}
            part={part}
          />
        ))
      );
    case "assistant":
      return (
        <>
          {typeof message.content === "string" ? (
            <OpenAITextContentPart type={type} part={message.content} presetKey={`${parentIndex}-text-0-${spanPath}`} />
          ) : (
            (message.content || []).map((part, index) => (
              <OpenAITextContentPart
                type={type}
                presetKey={`${parentIndex}-text-${index}-${spanPath}`}
                key={`${parentIndex}-text-${index}-${spanPath}`}
                part={part}
              />
            ))
          )}
          {(message?.tool_calls || []).map((part, index) => (
            <OpenAIToolCallContentPart
              type={type}
              key={part.id}
              part={part}
              presetKey={`${parentIndex}-tool-${index}-${spanPath}`}
            />
          ))}
        </>
      );
    case "user":
      if (typeof message.content === "string") {
        return (
          <OpenAITextContentPart type={type} part={message.content} presetKey={`${parentIndex}-text-0-${spanPath}`} />
        );
      }

      return message.content.map((part, index) => {
        switch (part.type) {
          case "text":
            return (
              <OpenAITextContentPart
                key={`${parentIndex}-text-${index}-${spanPath}`}
                type={type}
                part={part}
                presetKey={`${parentIndex}-text-${index}-${spanPath}`}
              />
            );
          case "file":
            return <OpenAIFileContentPart key={`${part.type}-${index}`} part={part} />;
          case "image_url":
            return <OpenAIImageContentPart key={`${part.type}-${index}`} part={part} />;
        }
      });
    case "tool":
      if (typeof message.content === "string") {
        return (
          <ToolResultContentPart
            type={type}
            toolCallId={message.tool_call_id || "-"}
            content={message.content}
            presetKey={`${parentIndex}-tool-0-${spanPath}`}
          />
        );
      }

      return message.content.map((part, index) => (
        <ToolResultContentPart
          key={`${parentIndex}-tool-${index}-${spanPath}`}
          toolCallId={message.tool_call_id || "-"}
          content={part.text}
          type={type}
          presetKey={`${parentIndex}-tool-${index}-${spanPath}`}
        >
          <OpenAITextContentPart
            type={type}
            key={`${message.role}-${part.type}-${index}`}
            part={part}
            presetKey={`${parentIndex}-text-${index}-${spanPath}`}
          />
        </ToolResultContentPart>
      ));

    default:
      return null;
  }
};

const OpenAIContentParts = memo(PureOpenAIContentParts);
export default OpenAIContentParts;
