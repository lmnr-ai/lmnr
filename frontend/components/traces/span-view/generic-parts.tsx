import {
  type FilePart,
  type ImagePart,
  type ModelMessage,
  type TextPart,
  type ToolCallPart,
  type ToolResultPart,
} from "ai";
import { omit } from "lodash";
import React, { memo } from "react";

import {
  FileContentPart,
  ImageContentPart,
  TextContentPart,
  ThinkingContentPart,
  ToolCallContentPart,
  ToolResultContentPart,
} from "./common";

const GenericImageContentPart = ({ part }: { part: ImagePart }) => <ImageContentPart src={String(part.image)} />;

const GenericFileContentPart = ({ part }: { part: FilePart }) => {
  if (typeof part.data === "string") {
    return <FileContentPart data={part.data} />;
  }
  return null;
};

const GenericTextContentPart = ({
  part,
  presetKey,
  messageIndex,
  contentPartIndex,
}: {
  part: TextPart;
  presetKey: string;
  messageIndex?: number;
  contentPartIndex?: number;
}) => (
  <TextContentPart
    content={part.text}
    presetKey={presetKey}
    messageIndex={messageIndex}
    contentPartIndex={contentPartIndex}
  />
);

// `ReasoningPart` is not re-exported from "ai" (only imported internally from
// `@ai-sdk/provider-utils`), so we type against its rendered shape directly.
const GenericReasoningContentPart = ({
  part,
  presetKey,
  messageIndex,
  contentPartIndex,
}: {
  part: { type: "reasoning"; text: string };
  presetKey: string;
  messageIndex?: number;
  contentPartIndex?: number;
}) => (
  <ThinkingContentPart
    content={part.text}
    presetKey={presetKey}
    messageIndex={messageIndex}
    contentPartIndex={contentPartIndex}
  />
);

const GenericToolCallContentPart = ({
  part,
  presetKey,
  messageIndex,
  contentPartIndex,
}: {
  part: ToolCallPart;
  presetKey: string;
  messageIndex?: number;
  contentPartIndex?: number;
}) => (
  <ToolCallContentPart
    toolName={part.toolName}
    toolCallId={part.toolCallId}
    content={omit(part, "type")}
    presetKey={presetKey}
    messageIndex={messageIndex}
    contentPartIndex={contentPartIndex}
  />
);

const GenericToolResultContentPart = ({ part, presetKey }: { part: ToolResultPart; presetKey: string }) => (
  <ToolResultContentPart
    toolCallId={part.toolCallId}
    toolName={part.toolName}
    content={omit(part, "type")}
    presetKey={presetKey}
  />
);

// v7 broadened the ModelMessage union with parts that have no dedicated UI
// (`custom`, `reasoning-file`, `tool-approval-request`, `tool-approval-response`).
// Surface them as a labeled JSON block so nothing is silently dropped.
const GenericUnknownContentPart = ({
  part,
  presetKey,
  messageIndex,
  contentPartIndex,
}: {
  part: { type?: string };
  presetKey: string;
  messageIndex?: number;
  contentPartIndex?: number;
}) => (
  <TextContentPart
    content={JSON.stringify(part, null, 2)}
    presetKey={presetKey}
    messageIndex={messageIndex}
    contentPartIndex={contentPartIndex}
  />
);

const PureContentParts = ({
  message,
  presetKey,
  parentIndex,
}: {
  message: Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] };
  parentIndex: number;
  presetKey: string;
}) => {
  if (typeof message.content === "string") {
    return (
      <GenericTextContentPart
        presetKey={`${parentIndex}-text-0-${presetKey}`}
        part={{ type: "text", text: message.content }}
        messageIndex={parentIndex}
        contentPartIndex={0}
      />
    );
  }

  return message.content.map((part, index) => {
    switch (part.type) {
      case "image":
        return <GenericImageContentPart key={`${part.type}-${index}`} part={part} />;
      case "text":
        return (
          <GenericTextContentPart
            key={`${parentIndex}-text-${index}-${presetKey}`}
            part={part}
            presetKey={`${parentIndex}-${part.type}-${index}-${presetKey}`}
            messageIndex={parentIndex}
            contentPartIndex={index}
          />
        );
      case "reasoning":
        return (
          <GenericReasoningContentPart
            key={`${parentIndex}-reasoning-${index}-${presetKey}`}
            part={part}
            presetKey={`${parentIndex}-${part.type}-${index}-${presetKey}`}
            messageIndex={parentIndex}
            contentPartIndex={index}
          />
        );
      case "tool-call":
        return (
          <GenericToolCallContentPart
            key={`${part.type}-${index}`}
            part={part}
            presetKey={`${parentIndex}-${part.type}-${index}-${presetKey}`}
            messageIndex={parentIndex}
            contentPartIndex={index}
          />
        );
      case "tool-result":
        return (
          <GenericToolResultContentPart
            key={`${part.type}-${index}`}
            part={part}
            presetKey={`${parentIndex}-${part.type}-${index}-${presetKey}`}
          />
        );
      case "file":
        return <GenericFileContentPart key={`${part.type}-${index}`} part={part} />;
      default: {
        const unknownPart = part as { type?: string };
        return (
          <GenericUnknownContentPart
            key={`${unknownPart.type ?? "unknown"}-${index}`}
            part={unknownPart}
            presetKey={`${parentIndex}-${unknownPart.type ?? "unknown"}-${index}-${presetKey}`}
            messageIndex={parentIndex}
            contentPartIndex={index}
          />
        );
      }
    }
  });
};

export default memo(PureContentParts);
