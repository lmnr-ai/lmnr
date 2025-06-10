import { useVirtualizer } from "@tanstack/react-virtual";
import { isEqual } from "lodash";
import { ChevronDown } from "lucide-react";
import { memo, useCallback, useMemo, useRef } from "react";

import ImageWithPreview from "@/components/playground/image-with-preview";
import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage, ChatMessageContentPart, ChatMessageToolCall, OpenAIImageUrl } from "@/lib/types";

import DownloadButton from "../ui/download-button";
import PdfRenderer from "../ui/pdf-renderer";

interface ContentPartImageProps {
  b64_data: string;
}

function PureContentPartImage({ b64_data }: ContentPartImageProps) {
  return (
    <ImageWithPreview
      src={`data:image/png;base64,${b64_data}`}
      className="object-cover rounded-sm size-16 ml-2 mt-2 mb-1"
      alt="span image"
    />
  );
}

function PureContentPartImageUrl({ url }: { url: string }) {
  // if url is a relative path, add ?payloadType=image to the end of the url
  // because it implies that we stored the image in S3
  if (url.startsWith("/")) url += "?payloadType=image";
  return <ImageWithPreview src={url} className="object-cover rounded-sm size-16 ml-2 mt-2 mb-1" alt="span image" />;
}

function PureContentPartDocumentUrl({ url }: { url: string }) {
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

const ContentPartImage = memo(PureContentPartImage);
const ContentPartImageUrl = memo(PureContentPartImageUrl);
const ContentPartDocumentUrl = memo(PureContentPartDocumentUrl);

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
            return <ContentPartImageUrl url={openAIImageUrl.image_url.url} />;
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

interface ChatMessageListTabProps {
  messages: {
    role?: ChatMessage["role"];
    content: ChatMessageContentPart[];
    tool_calls?: Record<string, unknown>[];
  }[];
  presetKey?: string | null;
}

function PureChatMessageListTab({ messages, presetKey }: ChatMessageListTabProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 500,
    overscan: 16,
    gap: 16,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <ScrollArea
      ref={parentRef}
      className="h-full relative overflow-y-auto"
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
            transform: `translateY(${items[0]?.start ?? 0}px)`,
          }}
          className="p-4 absolute top-0 left-0 w-full"
        >
          {items.map((virtualRow) => {
            const message = messages[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="flex flex-col border rounded mb-4"
              >
                {message?.role && (
                  <div className="font-medium text-sm text-secondary-foreground p-2 border-b">
                    {message.role.toUpperCase()}
                  </div>
                )}
                <ContentParts presetKey={presetKey} contentParts={message.content} />
                {message.tool_calls && (
                  <CodeHighlighter
                    readOnly
                    collapsible
                    value={JSON.stringify(message.tool_calls, null, 2)}
                    presetKey={presetKey}
                    className="max-h-[400px] border-none"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Button
        variant="outline"
        size="icon"
        className="absolute bottom-3 right-3 rounded-full"
        onClick={() => virtualizer.scrollToIndex(messages.length - 1, { align: "end" })}
      >
        <ChevronDown className="w-4 h-4" />
      </Button>
    </ScrollArea>
  );
}

const ChatMessageListTab = memo(PureChatMessageListTab, (prevProps, nextProps) => {
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  return isEqual(prevProps.messages, nextProps.messages);
});

export default ChatMessageListTab;
