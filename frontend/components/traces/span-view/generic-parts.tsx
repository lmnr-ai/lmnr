import { FilePart, ImagePart, ModelMessage, TextPart, ToolCallPart, ToolResultPart } from "ai";
import { omit } from "lodash";
import React, { memo } from "react";

import {
  FileContentPart,
  ImageContentPart,
  TextContentPart,
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
    content={omit(part, "type")}
    presetKey={presetKey}
    messageIndex={messageIndex}
    contentPartIndex={contentPartIndex}
  />
);

const GenericToolResultContentPart = ({
  part,
  presetKey,
}: {
  part: ToolResultPart;
  presetKey: string;
}) => (
  <ToolResultContentPart toolCallId={part.toolCallId} content={omit(part, "type")} presetKey={presetKey} />
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
      default:
        return;
    }
  });
};

export default memo(PureContentParts);
