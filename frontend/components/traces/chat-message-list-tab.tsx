import { uniqueId } from "lodash";
import React, { ImgHTMLAttributes, memo, useMemo, useRef } from "react";
import { AutoSizer, CellMeasurer, CellMeasurerCache, List, ListRowRenderer } from "react-virtualized";

import ImageWithPreview from "@/components/playground/image-with-preview";
import { ChatMessage, ChatMessageContentPart, flattenContentOfMessages, OpenAIImageUrl } from "@/lib/types";

import CodeHighlighter from "../ui/code-highlighter";
import DownloadButton from "../ui/download-button";
import PdfRenderer from "../ui/pdf-renderer";

interface ContentPartImageProps {
  b64_data: string;
}

function ContentPartImage({ b64_data, ...rest }: ContentPartImageProps & ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <ImageWithPreview
      src={`data:image/png;base64,${b64_data}`}
      className="object-cover rounded-sm size-16 ml-2"
      alt="span image"
      {...rest}
    />
  );
}

function ContentPartImageUrl({ src, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  // if url is a relative path, add ?payloadType=image to the end of the url
  // because it implies that we stored the image in S3
  if (typeof src === "string" && src.startsWith("/")) src += "?payloadType=image";
  return <ImageWithPreview src={src} className="object-cover rounded-sm size-16 ml-2" {...rest} />;
}

function ContentPartDocumentUrl({ url }: { url: string }) {
  return url.endsWith(".pdf") ? (
    <PdfRenderer url={url} className="w-full h-[50vh]" />
  ) : (
    <DownloadButton uri={url} filenameFallback={url} supportedFormats={[]} variant="outline" />
  );
}

interface ChatMessageListTabProps {
  messages: ChatMessage[];
}

function PureChatMessageListTab({ messages }: ChatMessageListTabProps) {
  const transformedMessages = useMemo(() => flattenContentOfMessages(messages), [messages]);

  return transformedMessages.map((message) => (
    <div key={uniqueId()} className="border rounded h-full overflow-auto mb-4">
      <div className="font-medium text-sm text-secondary-foreground border-b p-2">{message.role.toUpperCase()}</div>
      <ContentRenderer contentParts={message.content} />
    </div>
  ));
}

const ContentRenderer = ({ contentParts }: { contentParts: ChatMessageContentPart[] }) => {
  const cache = useMemo(
    () =>
      new CellMeasurerCache({
        fixedWidth: true,
        keyMapper: (index) => index,
      }),
    []
  );

  const listRef = useRef<List>(null);

  const rowRenderer: ListRowRenderer = ({ index, key, parent, style }) => {
    const contentPart = contentParts[index];

    switch (contentPart.type) {
      case "text":
        return (
          <CellMeasurer columnIndex={0} rowIndex={index} key={key} cache={cache} parent={parent}>
            {({ registerChild, measure }) => (
              <div style={style} ref={registerChild}>
                <CodeHighlighter language="json" code={contentPart.text} />
              </div>
            )}
          </CellMeasurer>
        );
      case "image":
        return (
          <CellMeasurer columnIndex={0} rowIndex={index} key={key} cache={cache} parent={parent}>
            {({ registerChild, measure }) => (
              <div style={style} ref={registerChild}>
                <ContentPartImage onLoad={measure} b64_data={contentPart.data} />
              </div>
            )}
          </CellMeasurer>
        );
      case "image_url":
        if (contentPart.url) {
          return (
            <CellMeasurer columnIndex={0} rowIndex={index} key={key} cache={cache} parent={parent}>
              {({ registerChild, measure }) => (
                <div style={style} ref={registerChild}>
                  <ContentPartImageUrl onLoad={measure} src={contentPart.url} alt="span image" />
                </div>
              )}
            </CellMeasurer>
          );
        } else {
          const openAIImageUrl = contentPart as any as OpenAIImageUrl;
          return (
            <CellMeasurer columnIndex={0} rowIndex={index} key={key} cache={cache} parent={parent}>
              {({ measure, registerChild }) => (
                <div style={style} ref={registerChild}>
                  <img src={openAIImageUrl.image_url.url} onLoad={measure} alt="span image" className="w-full" />
                </div>
              )}
            </CellMeasurer>
          );
        }
      case "document_url":
        return (
          <CellMeasurer columnIndex={0} rowIndex={index} key={key} cache={cache} parent={parent}>
            {({ registerChild }) => (
              <div style={style} ref={registerChild}>
                <ContentPartDocumentUrl url={contentPart.url} />
              </div>
            )}
          </CellMeasurer>
        );
      default:
        return <div>Unknown content part</div>;
    }
  };

  return (
    <AutoSizer>
      {({ width, height }) => (
        <List
          ref={listRef}
          width={width}
          height={height}
          deferredMeasurementCache={cache}
          rowHeight={cache.rowHeight}
          rowCount={contentParts.length}
          rowRenderer={rowRenderer}
          overscanRowCount={5}
        />
      )}
    </AutoSizer>
  );
};
const ChatMessageListTab = memo(PureChatMessageListTab);

export default ChatMessageListTab;
