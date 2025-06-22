import { CoreMessage, FilePart, ImagePart, TextPart, ToolCallPart, ToolResultPart } from "ai";
import { omit } from "lodash";
import { Bolt } from "lucide-react";
import React, { memo } from "react";

import ImageWithPreview from "@/components/playground/image-with-preview";
import { Badge } from "@/components/ui/badge";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import DownloadButton from "@/components/ui/download-button";
import PdfRenderer from "@/components/ui/pdf-renderer";

const PureImageContentPart = ({ part }: { part: ImagePart }) => {
  if (typeof part.image === "string" && part.image.startsWith("/"))
    return (
      <ImageWithPreview
        src={`${part.image}?payloadType=image`}
        className="object-cover rounded-sm size-16 ml-2 mt-2 mb-1"
        alt="span image"
      />
    );

  return (
    <ImageWithPreview
      src={String(part.image)}
      className="object-cover rounded-sm size-16 ml-2 mt-2 mb-1"
      alt="span image"
    />
  );
};

const PureFileContentPart = ({ part }: { part: FilePart }) => {
  if (typeof part.data === "string") {
    return part.data.endsWith(".pdf") ? (
      <PdfRenderer url={part.data} className="w-full h-[50vh]" />
    ) : (
      <DownloadButton uri={part.data} filenameFallback={part.data} supportedFormats={[]} variant="outline" />
    );
  }
};

const PureTextContentPart = ({ part, presetKey }: { part: TextPart; presetKey?: string }) => (
  <CodeHighlighter readOnly value={part.text} presetKey={presetKey} className="max-h-[400px] border-0" />
);

const PureToolCallContentPart = ({ part, presetKey }: { part: ToolCallPart; presetKey?: string }) => (
  <div className="flex flex-col gap-2 p-2 bg-background">
    <span className="flex items-center text-xs">
      <Bolt size={12} className="min-w-3 mr-2" /> {part.toolName}
    </span>
    <CodeHighlighter
      readOnly
      codeEditorClassName="rounded"
      value={JSON.stringify(omit(part, "type"), null, 2)}
      presetKey={presetKey}
      className="max-h-[400px] border-0"
    />
  </div>
);

const PureToolResultContentPart = ({ part, presetKey }: { part: ToolResultPart; presetKey?: string }) => (
  <div className="flex flex-col gap-2 p-2 bg-background">
    <Badge className="w-fit m-1 font-medium" variant="secondary">
      ID: {part.toolCallId}
    </Badge>
    <CodeHighlighter
      readOnly
      value={JSON.stringify(omit(part, "type"), null, 2)}
      presetKey={presetKey}
      className="max-h-[400px] border-0"
    />
  </div>
);

const ImageContentPart = memo(PureImageContentPart);
const FileContentPart = memo(PureFileContentPart);
const TextContentPart = memo(PureTextContentPart);
const ToolCallContentPart = memo(PureToolCallContentPart);
const ToolResultContentPart = memo(PureToolResultContentPart);

const PureContentParts = ({
  message,
  presetKey,
}: {
  message: Omit<CoreMessage, "role"> & { role?: CoreMessage["role"] };
  presetKey?: string;
}) => {
  const getParts = () => {
    if (typeof message.content === "string") {
      return <TextContentPart presetKey={presetKey} part={{ type: "text", text: message.content }} />;
    }

    return message.content.map((part, index) => {
      switch (part.type) {
        case "image":
          return <ImageContentPart key={`${part.type}-${index}`} part={part} />;
        case "text":
          return <TextContentPart key={`${part.type}-${index}`} part={part} presetKey={presetKey} />;
        case "tool-call":
          return <ToolCallContentPart key={`${part.type}-${index}`} part={part} presetKey={presetKey} />;
        case "tool-result":
          return <ToolResultContentPart key={`${part.type}-${index}`} part={part} presetKey={presetKey} />;
        case "file":
          return <FileContentPart key={`${part.type}-${index}`} part={part} />;
        default:
          return;
      }
    });
  };

  return (
    <>
      {message?.role && (
        <div className="font-medium text-sm text-secondary-foreground p-2">{message.role.toUpperCase()}</div>
      )}
      {getParts()}
    </>
  );
};

export default memo(PureContentParts);
