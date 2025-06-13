import { CoreMessage, FilePart, ImagePart, TextPart, ToolCallPart, ToolResultPart } from "ai";
import { omit } from "lodash";
import { memo } from "react";

import ImageWithPreview from "@/components/playground/image-with-preview";
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
      src={`data:image/png;base64,${part.image}`}
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
  <CodeHighlighter readOnly collapsible value={part.text} presetKey={presetKey} className="max-h-[400px] border-none" />
);

const PureToolCallContentPart = ({ part, presetKey }: { part: ToolCallPart; presetKey?: string }) => (
  <CodeHighlighter
    readOnly
    collapsible
    value={JSON.stringify(omit(part, "type"), null, 2)}
    presetKey={presetKey}
    className="max-h-[400px] border-none"
  />
);

const PureToolResultContentPart = ({ part, presetKey }: { part: ToolResultPart; presetKey?: string }) => (
  <CodeHighlighter
    readOnly
    collapsible
    value={JSON.stringify(omit(part, "type"), null, 2)}
    presetKey={presetKey}
    className="max-h-[400px] border-none"
  />
);

const ImageContentPart = memo(PureImageContentPart);
const FileContentPart = memo(PureFileContentPart);
const TextContentPart = memo(PureTextContentPart);
const ToolCallContentPart = memo(PureToolCallContentPart);
const ToolResultContentPart = memo(PureToolResultContentPart);

const PureContentParts = ({ content, presetKey }: { content: CoreMessage["content"]; presetKey?: string }) => {
  if (typeof content === "string") {
    return <TextContentPart presetKey={presetKey} part={{ type: "text", text: content }} />;
  }

  return content.map((part, index) => {
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

export default memo(PureContentParts);
