import { memo, useCallback, useMemo } from "react";

import ImageWithPreview from "@/components/playground/image-with-preview";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import DownloadButton from "@/components/ui/download-button";
import PdfRenderer from "@/components/ui/pdf-renderer";
import { ChatMessageContentPart, OpenAIImageUrl } from "@/lib/types";

export interface ContentPartImageProps {
  b64_data: string;
}

interface ContentPartsProps {
  contentParts: ChatMessageContentPart[];
  presetKey?: string | null;
}

export function PureContentPartImage({ b64_data }: ContentPartImageProps) {
  return (
    <ImageWithPreview
      src={`data:image/png;base64,${b64_data}`}
      className="object-cover rounded-sm size-16 ml-2 mt-2 mb-1"
      alt="span image"
    />
  );
}

export const PureContentPartImageUrl = ({ url }: { url: string }) => {
  // if url is a relative path, add ?payloadType=image to the end of the url
  // because it implies that we stored the image in S3
  if (url.startsWith("/")) url += "?payloadType=image";
  return <ImageWithPreview src={url} className="object-cover rounded-sm size-16 ml-2 mt-2 mb-1" alt="span image" />;
};

export const PureContentPartDocumentUrl = ({ url }: { url: string }) =>
  url.endsWith(".pdf") ? (
    <PdfRenderer url={url} className="w-full h-[50vh]" />
  ) : (
    <DownloadButton uri={url} filenameFallback={url} supportedFormats={[]} variant="outline" />
  );

const ContentParts = ({ contentParts, presetKey }: ContentPartsProps) => {
  const renderContentPart = useCallback(
    (contentPart: ChatMessageContentPart) => {
      switch (contentPart.type) {
        case "text":
          return (
            <CodeHighlighter
              readOnly
              collapsible
              value={contentPart.text}
              presetKey={presetKey}
              className="max-h-[400px] border-none"
            />
          );
        case "image":
          return <ContentPartImage b64_data={contentPart.data} />;
        case "image_url":
          if (contentPart.url) {
            return <ContentPartImageUrl url={contentPart.url} />;
          } else {
            const openAIImageUrl = contentPart as any as OpenAIImageUrl;
            return <img src={openAIImageUrl.image_url.url} alt="span image" className="w-full" />;
          }
        case "document_url":
          return <ContentPartDocumentUrl url={contentPart.url} />;
        case "tool_call":
          return (
            <CodeHighlighter
              collapsible
              value={JSON.stringify(contentPart, null, 2)}
              presetKey={presetKey}
              className="max-h-[400px] border-none"
            />
          );
        default:
          return <div>Unknown content part</div>;
      }
    },
    [presetKey]
  );

  const memoizedContentParts = useMemo(
    () =>
      contentParts.map((contentPart, index) => ({
        key: `${contentPart.type}-${index}`,
        part: contentPart,
      })),
    [contentParts]
  );

  return (
    <div className="flex flex-col w-full divide-y">
      {memoizedContentParts.map(({ key, part }) => (
        <div key={key} className="w-full">
          {renderContentPart(part)}
        </div>
      ))}
    </div>
  );
};

const ContentPartImage = memo(PureContentPartImage);
const ContentPartImageUrl = memo(PureContentPartImageUrl);
const ContentPartDocumentUrl = memo(PureContentPartDocumentUrl);
export default ContentParts;
