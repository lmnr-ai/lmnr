import React, { memo } from "react";
import { z } from "zod";

import ImageWithPreview from "@/components/playground/image-with-preview";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import DownloadButton from "@/components/ui/download-button";
import PdfRenderer from "@/components/ui/pdf-renderer";
import {
  OpenAIFilePartSchema,
  OpenAIImagePartSchema,
  OpenAIMessageSchema,
  OpenAITextPartSchema,
  OpenAIToolCallPartSchema,
} from "@/lib/spans/types";

const PureImageContentPart = ({ part }: { part: z.infer<typeof OpenAIImagePartSchema> }) => {
  if (part.image_url.url.startsWith("/"))
    return (
      <ImageWithPreview
        src={`${part.image_url.url}?payloadType=image`}
        className="object-cover rounded-sm size-16 ml-2 mt-2 mb-1"
        alt="span image"
      />
    );

  return (
    <ImageWithPreview
      src={part.image_url.url}
      className="object-cover rounded-sm size-16 ml-2 mt-2 mb-1"
      alt="span image"
    />
  );
};

const PureFileContentPart = ({ part }: { part: z.infer<typeof OpenAIFilePartSchema> }) => {
  if (typeof part.file.file_data === "string") {
    return part.file.file_data.endsWith(".pdf") ? (
      <PdfRenderer url={part.file.file_data} className="w-full h-[50vh]" />
    ) : (
      <DownloadButton
        uri={part.file.file_data}
        filenameFallback={part.file.filename || "-"}
        supportedFormats={[]}
        variant="outline"
      />
    );
  }
};

const PureTextContentPart = ({
  part,
  presetKey,
}: {
  part: z.infer<typeof OpenAITextPartSchema> | string;
  presetKey?: string;
}) => {
  if (typeof part === "string") {
    return (
      <CodeHighlighter readOnly collapsible value={part} presetKey={presetKey} className="max-h-[400px] border-none" />
    );
  }
  return (
    <CodeHighlighter
      readOnly
      collapsible
      value={part.text}
      presetKey={presetKey}
      className="max-h-[400px] border-none"
    />
  );
};

const PureToolCallContentPart = ({
  part,
  presetKey,
}: {
  part: z.infer<typeof OpenAIToolCallPartSchema>;
  presetKey?: string;
}) => (
  <CodeHighlighter
    readOnly
    collapsible
    value={JSON.stringify(part, null, 2)}
    presetKey={presetKey}
    className="max-h-[400px] border-none"
  />
);

const ImageContentPart = memo(PureImageContentPart);
const FileContentPart = memo(PureFileContentPart);
const TextContentPart = memo(PureTextContentPart);
const ToolCallContentPart = memo(PureToolCallContentPart);

const PureOpenAIContentParts = ({
  message,
  presetKey,
}: {
  message: z.infer<typeof OpenAIMessageSchema>;
  presetKey?: string;
}) => {
  switch (message.role) {
    case "system":
      return typeof message.content === "string" ? (
        <TextContentPart part={message.content} presetKey={presetKey} />
      ) : (
        (message.content || []).map((part, index) => (
          <TextContentPart key={`${message.role}-${part.type}=${index}`} part={part} presetKey={presetKey} />
        ))
      );
    case "assistant":
      return (
        <>
          {typeof message.content === "string" ? (
            <TextContentPart part={message.content} presetKey={presetKey} />
          ) : (
            (message.content || []).map((part, index) => (
              <TextContentPart key={`${message.role}-${part.type}=${index}`} part={part} presetKey={presetKey} />
            ))
          )}
          {(message?.tool_calls || []).map((part) => (
            <ToolCallContentPart key={part.id} part={part} presetKey={presetKey} />
          ))}
        </>
      );
    case "user":
      if (typeof message.content === "string") {
        return <TextContentPart part={message.content} presetKey={presetKey} />;
      }

      return message.content.map((part, index) => {
        switch (part.type) {
          case "text":
            return <TextContentPart key={`${part.type}-${index}`} part={part} presetKey={presetKey} />;
          case "file":
            return <FileContentPart key={`${part.type}-${index}`} part={part} />;
          case "image_url":
            return <ImageContentPart key={`${part.type}-${index}`} part={part} />;
        }
      });
    case "tool":
      if (typeof message.content === "string") {
        return <TextContentPart part={message.content} presetKey={presetKey} />;
      }

      return message.content.map((part, index) => (
        <TextContentPart key={`${message.role}-${part.type}=${index}`} part={part} presetKey={presetKey} />
      ));

    default:
      return null;
  }
};

const OpenAIContentParts = memo(PureOpenAIContentParts);
export default OpenAIContentParts;
