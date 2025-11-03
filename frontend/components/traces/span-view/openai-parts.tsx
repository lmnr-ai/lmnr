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
  presetKey,
}: {
  part: z.infer<typeof OpenAITextPartSchema> | string;
  presetKey: string;
}) => {
  const content = typeof part === "string" ? part : part.text;
  return <TextContentPart content={content} presetKey={presetKey} />;
};

const PureOpenAIToolCallContentPart = ({
  part,
  presetKey,
}: {
  part: z.infer<typeof OpenAIToolCallPartSchema>;
  presetKey: string;
}) => <ToolCallContentPart toolName={part.function.name} content={part} presetKey={presetKey} />;

const OpenAIImageContentPart = memo(PureOpenAIImageContentPart);
const OpenAIFileContentPart = memo(PureOpenAIFileContentPart);
const OpenAITextContentPart = memo(PureOpenAITextContentPart);
const OpenAIToolCallContentPart = memo(PureOpenAIToolCallContentPart);

const PureOpenAIContentParts = ({
  message,
  parentIndex,
  presetKey,
}: {
  message: z.infer<typeof OpenAIMessageSchema>;
  parentIndex: number;
  presetKey: string;
}) => {
  switch (message.role) {
    case "system":
      return typeof message.content === "string" ? (
        <OpenAITextContentPart part={message.content} presetKey={`${parentIndex}-text-0-${presetKey}`} />
      ) : (
        (message.content || []).map((part, index) => (
          <OpenAITextContentPart
            presetKey={`${parentIndex}-text-${index}-${presetKey}`}
            key={`${parentIndex}-text-${index}-${presetKey}`}
            part={part}
          />
        ))
      );
    case "assistant":
      return (
        <>
          {typeof message.content === "string" ? (
            <OpenAITextContentPart part={message.content} presetKey={`${parentIndex}-text-0-${presetKey}`} />
          ) : (
            (message.content || []).map((part, index) => (
              <OpenAITextContentPart
                presetKey={`${parentIndex}-text-${index}-${presetKey}`}
                key={`${parentIndex}-text-${index}-${presetKey}`}
                part={part}
              />
            ))
          )}
          {(message?.tool_calls || []).map((part, index) => (
            <OpenAIToolCallContentPart
              key={part.id}
              part={part}
              presetKey={`${parentIndex}-tool-${index}-${presetKey}`}
            />
          ))}
        </>
      );
    case "user":
      if (typeof message.content === "string") {
        return (
          <OpenAITextContentPart part={message.content} presetKey={`${parentIndex}-text-0-${presetKey}`} />
        );
      }

      return message.content.map((part, index) => {
        switch (part.type) {
          case "text":
            return (
              <OpenAITextContentPart
                key={`${parentIndex}-text-${index}-${presetKey}`}
                part={part}
                presetKey={`${parentIndex}-text-${index}-${presetKey}`}
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
            toolCallId={message.tool_call_id || "-"}
            content={message.content}
            presetKey={`${parentIndex}-tool-0-${presetKey}`}
          />
        );
      }

      return message.content.map((part, index) => (
        <ToolResultContentPart
          key={`${parentIndex}-tool-${index}-${presetKey}`}
          toolCallId={message.tool_call_id || "-"}
          content={part.text}
          presetKey={`${parentIndex}-tool-${index}-${presetKey}`}
        >
          <OpenAITextContentPart
            key={`${message.role}-${part.type}-${index}`}
            part={part}
            presetKey={`${parentIndex}-text-${index}-${presetKey}`}
          />
        </ToolResultContentPart>
      ));

    case "computer_call_output":
      return message.content.map((part, index) => {
        switch (part.type) {
          case "file":
            return <OpenAIFileContentPart key={`${part.type}-${index}`} part={part} />;
          case "image_url":
            return <OpenAIImageContentPart key={`${part.type}-${index}`} part={part} />;
        }
      });

    default:
      return null;
  }
};

const OpenAIContentParts = memo(PureOpenAIContentParts);
export default OpenAIContentParts;
