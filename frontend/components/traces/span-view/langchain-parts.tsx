import { Bolt } from "lucide-react";
import React, { memo } from "react";
import { z } from "zod";

import ImageWithPreview from "@/components/playground/image-with-preview";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import DownloadButton from "@/components/ui/download-button";
import PdfRenderer from "@/components/ui/pdf-renderer";
import { isStorageUrl } from "@/lib/s3";
import {
  LangChainContentPartSchema,
  LangChainImageUrlPartSchema,
  LangChainInvalidToolCallPartSchema,
  LangChainMessageSchema,
  LangChainToolCallPartSchema,
} from "@/lib/spans/types/langchain";

const PureLangChainContentParts = ({
  message,
  presetKey,
}: {
  message: z.infer<typeof LangChainMessageSchema>;
  presetKey?: string;
}) => {
  const getParts = () => {
    switch (message.role) {
      case "system":
      case "user":
      case "human":
        return <LangChainContentPart part={message.content} presetKey={presetKey} />;

      case "tool":
        return (
          <>
            <LangChainContentPart part={message.content} presetKey={presetKey} />
            <CodeHighlighter
              readOnly
              value={JSON.stringify({ tool_call_id: message.tool_call_id })}
              presetKey={presetKey}
              className="max-h-[400px] border-none"
            />
          </>
        );
      case "assistant":
      case "ai":
        return (
          <>
            <LangChainContentPart part={message.content} presetKey={presetKey} />
            {(message?.tool_calls || []).map((part, index) => (
              <div key={`${part.type}-${index}`} className="flex flex-col gap-2 p-2 bg-background">
                <span className="flex items-center text-xs">
                  <Bolt size={12} className="min-w-3 mr-2" /> {part.name}
                </span>
                <ToolCallPart part={part} presetKey={presetKey} />
              </div>
            ))}
            {(message?.invalid_tool_calls || []).map((part, index) => (
              <ToolCallPart key={`${part.type}-${index}`} part={part} presetKey={presetKey} />
            ))}
          </>
        );
    }
  };

  return (
    <>
      <div className="font-medium text-sm text-secondary-foreground p-2 border-b">{message.role.toUpperCase()}</div>
      {getParts()}
    </>
  );
};

const PureLangChainContentPart = ({
  part,
  presetKey,
}: {
  part: z.infer<typeof LangChainContentPartSchema>;
  presetKey?: string;
}) => {
  if (typeof part === "string") {
    return <CodeHighlighter readOnly value={part} presetKey={presetKey} className="max-h-[400px] border-none" />;
  }

  return part.map((item, index) => {
    switch (item.type) {
      case "image_url":
        return <ImageContentPart key={`${item.type}-${index}`} part={item} />;
      case "text":
        return (
          <CodeHighlighter
            key={`${item.type}-${index}`}
            readOnly
            value={item.text}
            presetKey={presetKey}
            className="max-h-[400px] border-none"
          />
        );
      case "image":
        if ("data" in item) {
          return (
            <ImageWithPreview
              key={`${item.type}-${index}`}
              src={item.data}
              className="object-cover rounded-sm size-16 ml-2 mt-2 mb-1"
              alt="span image"
            />
          );
        }
        if ("url" in item) {
          return (
            <ImageWithPreview
              key={`${item.type}-${index}`}
              src={item.url}
              className="object-cover rounded-sm size-16 ml-2 mt-2 mb-1"
              alt="span image"
            />
          );
        }

        return (
          <CodeHighlighter
            key={`${item.type}-${index}`}
            readOnly
            value={item.id}
            presetKey={presetKey}
            className="max-h-[400px] border-none"
          />
        );

      case "file":
        if ("data" in item) {
          if (item.data.endsWith(".pdf")) {
            return <PdfRenderer key={`${item.type}-${index}`} url={item.data} className="w-full h-[50vh]" />;
          } else {
            return (
              <DownloadButton
                key={`${item.type}-${index}`}
                uri={item.data}
                filenameFallback={item.data}
                supportedFormats={[]}
                variant="outline"
              />
            );
          }
        }

        if ("url" in item) {
          if (item.url.endsWith(".pdf")) {
            return <PdfRenderer key={`${item.type}-${index}`} url={item.url} className="w-full h-[50vh]" />;
          } else {
            return (
              <DownloadButton
                key={`${item.type}-${index}`}
                uri={item.url}
                filenameFallback={item.url}
                supportedFormats={[]}
                variant="outline"
              />
            );
          }
        }

        if ("text" in item) {
          return (
            <CodeHighlighter
              key={`${item.type}-${index}`}
              readOnly
              value={item.text}
              presetKey={presetKey}
              className="max-h-[400px] border-none"
            />
          );
        }

        return (
          <CodeHighlighter
            readOnly
            key={`${item.type}-${index}`}
            value={item.id}
            presetKey={presetKey}
            className="max-h-[400px] border-none"
          />
        );

      case "audio":
        return (
          <CodeHighlighter
            key={`${item.type}-${index}`}
            readOnly
            value={JSON.stringify(item)}
            presetKey={presetKey}
            className="max-h-[400px] border-none"
          />
        );

      default:
        return null;
    }
  });
};

const PureImageContentPart = ({ part }: { part: z.infer<typeof LangChainImageUrlPartSchema> }) => {
  const imageUrl = typeof part.image_url === "string" ? part.image_url : part.image_url.url;

  const src = isStorageUrl(imageUrl) ? `${imageUrl}?payloadType=image` : imageUrl;

  return <ImageWithPreview src={src} className="object-cover rounded-sm size-16 ml-2 mt-2 mb-1" alt="span image" />;
};

const PureToolCallPart = ({
  part,
  presetKey,
}: {
  part: z.infer<typeof LangChainToolCallPartSchema> | z.infer<typeof LangChainInvalidToolCallPartSchema>;
  presetKey?: string;
}) => (
  <CodeHighlighter
    readOnly
    value={JSON.stringify(part)}
    presetKey={presetKey}
    codeEditorClassName="rounded"
    className="max-h-[400px] border-none"
  />
);

const ToolCallPart = memo(PureToolCallPart);
const ImageContentPart = memo(PureImageContentPart);
const LangChainContentPart = memo(PureLangChainContentPart);
const LangChainContentParts = memo(PureLangChainContentParts);

export default LangChainContentParts;
