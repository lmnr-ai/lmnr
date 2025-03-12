import { uniqueId } from "lodash";
import { memo, useMemo } from "react";

import ImageWithPreview from "@/components/playground/image-with-preview";
import { ChatMessage, ChatMessageContentPart, OpenAIImageUrl } from "@/lib/types";
import { isStringType } from "@/lib/utils";

import DownloadButton from "../ui/download-button";
import Formatter from "../ui/formatter";
import PdfRenderer from "../ui/pdf-renderer";

interface ContentPartTextProps {
  text: string;
  presetKey?: string | null;
}

function ContentPartText({ text, presetKey }: ContentPartTextProps) {
  return (
    <Formatter collapsible value={text} className="rounded-none max-h-[400px] border-none" presetKey={presetKey} />
  );
}

interface ContentPartImageProps {
  b64_data: string;
}

function ContentPartImage({ b64_data }: ContentPartImageProps) {
  return (
    <ImageWithPreview
      src={`data:image/png;base64,${b64_data}`}
      className="object-cover rounded-sm size-16 ml-2"
      alt="span image"
    />
  );
}

function ContentPartImageUrl({ url }: { url: string }) {
  // if url is a relative path, add ?payloadType=image to the end of the url
  // because it implies that we stored the image in S3
  if (url.startsWith("/")) url += "?payloadType=image";
  return <ImageWithPreview src={url} className="object-cover rounded-sm size-16 ml-2" alt="span image" />;
}

function ContentPartDocumentUrl({ url }: { url: string }) {
  return url.endsWith(".pdf") ? (
    <PdfRenderer url={url} className="w-full h-[50vh]" />
  ) : (
    <DownloadButton uri={url} filenameFallback={url} supportedFormats={[]} variant="outline" />
  );
}

interface ContentPartsProps {
  contentParts: ChatMessageContentPart[];
}

function ContentParts({ contentParts }: ContentPartsProps) {
  const renderContentPart = (contentPart: ChatMessageContentPart) => {
    switch (contentPart.type) {
      case "text":
        return <ContentPartText text={contentPart.text} />;
      case "image":
        return <ContentPartImage b64_data={contentPart.data} />;
      case "image_url":
        // it means we managed to parse span input and properly store image in S3
        if (contentPart.url) {
          return <ContentPartImageUrl url={contentPart.url} />;
        } else {
          const openAIImageUrl = contentPart as any as OpenAIImageUrl;
          return <img src={openAIImageUrl.image_url.url} alt="span image" className="w-full" />;
        }
      case "document_url":
        return <ContentPartDocumentUrl url={contentPart.url} />;
      default:
        return <div>Unknown content part</div>;
    }
  };

  return (
    <div className="flex flex-col space-y-2 w-full">
      {contentParts.map((contentPart, index) => (
        <div key={index} className="w-full">
          {renderContentPart(contentPart)}
        </div>
      ))}
    </div>
  );
}

interface ChatMessageListTabProps {
  messages: ChatMessage[];
  presetKey?: string | null;
  reversed: boolean;
}

function PureChatMessageListTab({ messages, presetKey, reversed }: ChatMessageListTabProps) {
  // Memoize messages to prevent unnecessary re-renders
  const memoizedMessages = useMemo(() => (reversed ? [...messages].reverse() : messages), [messages, reversed]);

  return (
    <div className="w-full flex flex-col space-y-4 flex-wrap">
      {memoizedMessages.map((message, index) => (
        <div key={uniqueId()} className="flex flex-col border rounded" style={{ contain: "content" }}>
          <div className="font-medium text-sm text-secondary-foreground border-b p-2">{message.role.toUpperCase()}</div>
          {isStringType(message.content) ? (
            <ContentPartText text={message.content} presetKey={`${presetKey}-${index}`} />
          ) : (
            <ContentParts contentParts={message.content} />
          )}
        </div>
      ))}
    </div>
  );
}

const ChatMessageListTab = memo(PureChatMessageListTab);

export default ChatMessageListTab;
