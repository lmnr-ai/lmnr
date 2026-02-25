import React, { memo } from "react";
import { type z } from "zod/v4";

import { type AnthropicContentBlock, type AnthropicMessageSchema, toKnownBlock } from "@/lib/spans/types/anthropic";

import { ImageContentPart, TextContentPart, ToolCallContentPart, ToolResultContentPart } from "./common";

const AnthropicPartRenderer = ({
  block,
  presetKey,
  messageIndex,
  contentPartIndex,
}: {
  block: AnthropicContentBlock;
  presetKey: string;
  messageIndex: number;
  contentPartIndex: number;
}) => {
  switch (block.type) {
    case "text":
      return (
        <TextContentPart
          content={block.text}
          presetKey={presetKey}
          messageIndex={messageIndex}
          contentPartIndex={contentPartIndex}
        />
      );

    case "thinking":
      return (
        <TextContentPart
          content={block.thinking}
          presetKey={presetKey}
          messageIndex={messageIndex}
          contentPartIndex={contentPartIndex}
        />
      );

    case "tool_use":
      return (
        <ToolCallContentPart
          toolName={block.name}
          content={block.input ?? {}}
          presetKey={presetKey}
          messageIndex={messageIndex}
          contentPartIndex={contentPartIndex}
        />
      );

    case "tool_result": {
      const resultContent = typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? "");
      return (
        <ToolResultContentPart
          toolCallId={block.tool_use_id}
          content={resultContent}
          presetKey={`${messageIndex}-tool-result-${contentPartIndex}-${presetKey}`}
        />
      );
    }

    case "image": {
      if (block.source.type === "base64") {
        const src = `data:${block.source.media_type};base64,${block.source.data}`;
        return <ImageContentPart src={src} />;
      }
      return <ImageContentPart src={block.source.url} />;
    }

    default:
      return null;
  }
};

const PureAnthropicContentParts = ({
  message,
  parentIndex,
  presetKey,
}: {
  message: z.infer<typeof AnthropicMessageSchema>;
  parentIndex: number;
  presetKey: string;
}) => {
  if (typeof message.content === "string") {
    return (
      <TextContentPart
        content={message.content}
        presetKey={`${parentIndex}-text-0-${presetKey}`}
        messageIndex={parentIndex}
        contentPartIndex={0}
      />
    );
  }

  return (
    <>
      {message.content.map((raw, index) => {
        const block = toKnownBlock(raw);
        if (!block) return null;
        return (
          <AnthropicPartRenderer
            key={`${parentIndex}-part-${index}-${presetKey}`}
            block={block}
            presetKey={`${parentIndex}-part-${index}-${presetKey}`}
            messageIndex={parentIndex}
            contentPartIndex={index}
          />
        );
      })}
    </>
  );
};

const AnthropicContentParts = memo(PureAnthropicContentParts);
export default AnthropicContentParts;
