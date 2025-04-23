import { ImgHTMLAttributes, memo, useMemo } from "react";
import { AutoSizer, CellMeasurer, CellMeasurerCache, List, ListRowRenderer } from "react-virtualized";

import ImageWithPreview from "@/components/playground/image-with-preview";
import { ChatMessage, ChatMessageContentPart, flattenChatMessages, OpenAIImageUrl } from "@/lib/types";

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

interface ContentPartsProps {
  contentParts: ChatMessageContentPart[];
  ref?: (element?: Element | null | undefined) => void;
}

interface ChatMessageListTabProps {
  messages: ChatMessage[];
  presetKey?: string | null;
}

function PureChatMessageListTab({ messages, presetKey }: ChatMessageListTabProps) {
  const contentParts = useMemo(() => flattenChatMessages(messages), [messages]);
  const cache = useMemo(
    () =>
      new CellMeasurerCache({
        fixedWidth: true,
        defaultHeight: 100,
        keyMapper: (index) => index, // Help with cache key stability
      }),
    []
  );

  const rowRenderer: ListRowRenderer = ({ index, key, parent }) => {
    const contentPart = contentParts[index];

    switch (contentPart.type) {
      case "text":
        return (
          <CellMeasurer key={key} cache={cache} parent={parent}>
            {({ registerChild }) => (
              <div ref={registerChild}>
                <ContentPartText text={contentPart.text} />
              </div>
            )}
          </CellMeasurer>
        );
      case "image":
        return (
          <CellMeasurer key={key} cache={cache} parent={parent}>
            {({ registerChild, measure }) => (
              <div ref={registerChild}>
                <ContentPartImage onLoad={measure} b64_data={contentPart.data} />
              </div>
            )}
          </CellMeasurer>
        );
      case "image_url":
        if (contentPart.url) {
          return (
            <CellMeasurer key={key} cache={cache} parent={parent}>
              {({ registerChild, measure }) => (
                <div ref={registerChild}>
                  <ContentPartImageUrl onLoad={measure} src={contentPart.url} alt="span image" />
                </div>
              )}
            </CellMeasurer>
          );
        } else {
          const openAIImageUrl = contentPart as any as OpenAIImageUrl;
          return (
            <CellMeasurer key={key} cache={cache} parent={parent}>
              {({ measure, registerChild }) => (
                <div ref={registerChild}>
                  <img src={openAIImageUrl.image_url.url} onLoad={measure} alt="span image" className="w-full" />
                </div>
              )}
            </CellMeasurer>
          );
        }
      case "document_url":
        return (
          <CellMeasurer key={key} cache={cache} parent={parent}>
            {({ registerChild }) => (
              <div ref={registerChild}>
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
    <div className="h-96">
      <AutoSizer>
        {(props) => (
          <List {...props} rowHeight={cache.rowHeight} rowCount={contentParts.length} rowRenderer={rowRenderer} />
        )}
      </AutoSizer>
    </div>
  );
}

const ChatMessageListTab = memo(PureChatMessageListTab);

export default ChatMessageListTab;
