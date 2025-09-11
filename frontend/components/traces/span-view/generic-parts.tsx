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
  type,
}: {
  part: TextPart;
  type: "input" | "output";
  presetKey: string;
}) => <TextContentPart type={type} content={part.text} presetKey={presetKey} />;

const GenericToolCallContentPart = ({
  part,
  type,
  presetKey,
}: {
  part: ToolCallPart;
  type: "input" | "output";
  presetKey: string;
}) => <ToolCallContentPart type={type} toolName={part.toolName} content={omit(part, "type")} presetKey={presetKey} />;

const GenericToolResultContentPart = ({
  part,
  type,
  presetKey,
}: {
  part: ToolResultPart;
  type: "input" | "output";
  presetKey: string;
}) => (
  <ToolResultContentPart type={type} toolCallId={part.toolCallId} content={omit(part, "type")} presetKey={presetKey} />
);

const PureContentParts = ({
  message,
  spanPath,
  parentIndex,
  type,
}: {
  message: Omit<ModelMessage, "role"> & { role?: ModelMessage["role"] };
  spanPath: string;
  parentIndex: number;
  type: "input" | "output";
}) => {
  if (typeof message.content === "string") {
    return (
      <GenericTextContentPart
        type={type}
        presetKey={`${parentIndex}-text-0-${spanPath}`}
        part={{ type: "text", text: message.content }}
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
            type={type}
            key={`${parentIndex}-text-${index}-${spanPath}`}
            part={part}
            presetKey={`${parentIndex}-${part.type}-${index}-${spanPath}`}
          />
        );
      case "tool-call":
        return (
          <GenericToolCallContentPart
            type={type}
            key={`${part.type}-${index}`}
            part={part}
            presetKey={`${parentIndex}-${part.type}-${index}-${spanPath}`}
          />
        );
      case "tool-result":
        return (
          <GenericToolResultContentPart
            type={type}
            key={`${part.type}-${index}`}
            part={part}
            presetKey={`${parentIndex}-${part.type}-${index}-${spanPath}`}
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
