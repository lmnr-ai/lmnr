import React, { memo } from "react";
import { z } from "zod";

import {
  OpenAIFilePartSchema,
  OpenAIImagePartSchema,
  OpenAIMessageSchema,
  OpenAITextPartSchema,
  OpenAIToolCallPartSchema,
} from "@/lib/spans/types";

import {
  FileContentPart,
  ImageContentPart,
  RoleHeader,
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
  presetKey?: string;
}) => {
  const content = typeof part === "string" ? part : part.text;
  return <TextContentPart content={content} presetKey={presetKey} />;
};

const PureOpenAIToolCallContentPart = ({
  part,
  presetKey,
}: {
  part: z.infer<typeof OpenAIToolCallPartSchema>;
  presetKey?: string;
}) => <ToolCallContentPart toolName={part.function.name} content={part} presetKey={presetKey} />;

const OpenAIImageContentPart = memo(PureOpenAIImageContentPart);
const OpenAIFileContentPart = memo(PureOpenAIFileContentPart);
const OpenAITextContentPart = memo(PureOpenAITextContentPart);
const OpenAIToolCallContentPart = memo(PureOpenAIToolCallContentPart);

const PureOpenAIContentParts = ({
  message,
  presetKey,
}: {
  message: z.infer<typeof OpenAIMessageSchema>;
  presetKey?: string;
}) => {
  const getParts = () => {
    switch (message.role) {
      case "system":
        return typeof message.content === "string" ? (
          <OpenAITextContentPart part={message.content} presetKey={presetKey} />
        ) : (
          (message.content || []).map((part, index) => (
            <OpenAITextContentPart key={`${message.role}-${part.type}=${index}`} part={part} presetKey={presetKey} />
          ))
        );
      case "assistant":
        return (
          <>
            {typeof message.content === "string" ? (
              <OpenAITextContentPart part={message.content} presetKey={presetKey} />
            ) : (
              (message.content || []).map((part, index) => (
                <OpenAITextContentPart
                  key={`${message.role}-${part.type}=${index}`}
                  part={part}
                  presetKey={presetKey}
                />
              ))
            )}
            {(message?.tool_calls || []).map((part) => (
              <OpenAIToolCallContentPart key={part.id} part={part} presetKey={presetKey} />
            ))}
          </>
        );
      case "user":
        if (typeof message.content === "string") {
          return <OpenAITextContentPart part={message.content} presetKey={presetKey} />;
        }

        return message.content.map((part, index) => {
          switch (part.type) {
            case "text":
              return <OpenAITextContentPart key={`${part.type}-${index}`} part={part} presetKey={presetKey} />;
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
              presetKey={presetKey}
            />
          );
        }

        return message.content.map((part, index) => (
          <ToolResultContentPart
            key={`${part.type}-${message.tool_call_id}`}
            toolCallId={message.tool_call_id || "-"}
            content=""
            presetKey={presetKey}
          >
            <OpenAITextContentPart key={`${message.role}-${part.type}-${index}`} part={part} presetKey={presetKey} />
          </ToolResultContentPart>
        ));

      default:
        return null;
    }
  };

  return (
    <>
      <RoleHeader role={message.role} />
      {getParts()}
    </>
  );
};

const OpenAIContentParts = memo(PureOpenAIContentParts);
export default OpenAIContentParts;
