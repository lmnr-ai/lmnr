import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown } from "lucide-react";
import { memo, useMemo, useRef } from "react";

import ImageWithPreview from "@/components/playground/image-with-preview";
import CodeHighlighter from "@/components/traces/code-highlighter";
import { Button } from "@/components/ui/button";
import { ChatMessage, ChatMessageContentPart, flattenContentOfMessages, OpenAIImageUrl } from "@/lib/types";

import DownloadButton from "../ui/download-button";
import PdfRenderer from "../ui/pdf-renderer";
interface ContentPartTextProps {
  text: string;
  presetKey?: string | null;
}

function ContentPartText({ text, presetKey }: ContentPartTextProps) {
  return <CodeHighlighter collapsible value={text} className="max-h-[400px] border-none" presetKey={presetKey} />;
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
  presetKey?: string | null;
}

function ContentParts({ contentParts, presetKey }: ContentPartsProps) {
  const renderContentPart = (contentPart: ChatMessageContentPart) => {
    switch (contentPart.type) {
      case "text":
        return <ContentPartText presetKey={presetKey} text={contentPart.text} />;
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
    <div className="flex flex-col gap-2 w-full">
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
}

function PureChatMessageListTab({ messages, presetKey }: ChatMessageListTabProps) {
  const memoizedMessages = useMemo(() => flattenContentOfMessages(messages), [messages]);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: memoizedMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 500,
    overscan: 5,
    gap: 16,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div className="relative h-full">
      <div
        ref={parentRef}
        className="List h-full overflow-y-auto"
        style={{
          width: "100%",
          contain: "strict",
        }}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${items[0]?.start ?? 0}px)`,
            }}
          >
            {items.map((virtualRow, index) => {
              const message = memoizedMessages[index];
              return (
                <div
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="flex flex-col border rounded mb-4"
                >
                  <div className="font-medium text-sm text-secondary-foreground border-b p-2">
                    {message.role.toUpperCase()}
                  </div>
                  <ContentParts presetKey={presetKey} contentParts={message.content} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Button
        variant="outline"
        size="icon"
        className="absolute bottom-3 right-3 rounded-full"
        onClick={() => virtualizer.scrollToIndex(virtualizer.options.count - 1, { align: "end", behavior: "smooth" })}
      >
        <ChevronDown className="w-4 h-4" />
      </Button>
    </div>
  );
}

const ChatMessageListTab = memo(PureChatMessageListTab);

export default ChatMessageListTab;
