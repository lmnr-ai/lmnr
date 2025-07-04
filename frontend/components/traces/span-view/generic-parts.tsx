import { CoreMessage, FilePart, ImagePart, TextPart, ToolCallPart, ToolResultPart } from "ai";
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

const GenericTextContentPart = ({ part, presetKey }: { part: TextPart; presetKey?: string }) => (
  <TextContentPart content={part.text} presetKey={presetKey} />
);

const GenericToolCallContentPart = ({ part, presetKey }: { part: ToolCallPart; presetKey?: string }) => (
  <ToolCallContentPart toolName={part.toolName} content={omit(part, "type")} presetKey={presetKey} />
);

const GenericToolResultContentPart = ({ part, presetKey }: { part: ToolResultPart; presetKey?: string }) => (
  <ToolResultContentPart toolCallId={part.toolCallId} content={omit(part, "type")} presetKey={presetKey} />
);

const PureContentParts = ({
  message,
  presetKey,
}: {
  message: Omit<CoreMessage, "role"> & { role?: CoreMessage["role"] };
  presetKey?: string;
}) => {
  if (typeof message.content === "string") {
    return <GenericTextContentPart presetKey={presetKey} part={{ type: "text", text: message.content }} />;
  }

  return message.content.map((part, index) => {
    switch (part.type) {
      case "image":
        return <GenericImageContentPart key={`${part.type}-${index}`} part={part} />;
      case "text":
        return <GenericTextContentPart key={`${part.type}-${index}`} part={part} presetKey={`${presetKey}-${index}`} />;
      case "tool-call":
        return (
          <GenericToolCallContentPart key={`${part.type}-${index}`} part={part} presetKey={`${presetKey}-${index}`} />
        );
      case "tool-result":
        return (
          <GenericToolResultContentPart key={`${part.type}-${index}`} part={part} presetKey={`${presetKey}-${index}`} />
        );
      case "file":
        return <GenericFileContentPart key={`${part.type}-${index}`} part={part} />;
      default:
        return;
    }
  });
};

export default memo(PureContentParts);
