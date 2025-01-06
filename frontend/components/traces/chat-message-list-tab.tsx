import { ChatMessage, ChatMessageContentPart } from '@/lib/types';
import { isStringType } from '@/lib/utils';

import DownloadButton from '../ui/download-button';
import Formatter from '../ui/formatter';
import PdfRenderer from '../ui/pdf-renderer';

interface ContentPartTextProps {
  text: string;
}

function ContentPartText({ text }: ContentPartTextProps) {
  return (
    <div className="w-full h-full">
      <Formatter
        collapsible
        value={text}
        className="rounded-none max-h-[50vh] border-none"
      />
    </div>
  );
}

interface ContentPartImageProps {
  b64_data: string;
}

function ContentPartImage({ b64_data }: ContentPartImageProps) {
  return <img src={`data:image/png;base64,${b64_data}`} alt="span image" />;
}

function ContentPartImageUrl({ url }: { url: string }) {
  return <img src={`${url}?payloadType=image`} alt="span image" />;
}

function ContentPartDocumentUrl({ url }: { url: string }) {
  return url.endsWith('.pdf')
    ? <PdfRenderer url={url} className="w-full h-[50vh]" />
    : <DownloadButton
      uri={url}
      filenameFallback={url}
      supportedFormats={[]}
      variant="outline"
    />;
}

interface ContentPartsProps {
  contentParts: ChatMessageContentPart[];
}

function ContentParts({ contentParts }: ContentPartsProps) {
  console.log(contentParts);
  return (
    <div className="flex flex-col space-y-2">
      {contentParts.map((contentPart, index) => (
        <div key={index}>
          {contentPart.type === 'text' ? (
            <ContentPartText text={contentPart.text} />
          ) : contentPart.type === 'image' ? (
            <ContentPartImage b64_data={contentPart.data} />
          ) : contentPart.type === 'image_url' ? (
            <ContentPartImageUrl url={contentPart.url} />
          ) : contentPart.type === 'document_url' ? (
            <ContentPartDocumentUrl url={contentPart.url} />
          ) : (
            <div>Unknown content part</div>
          )}
        </div>
      ))}
    </div>
  );
}

interface ChatMessageListTabProps {
  messages: ChatMessage[];
}

export default function ChatMessageListTab({
  messages
}: ChatMessageListTabProps) {
  return (
    <div className="w-full h-full flex flex-col space-y-4">
      {messages.map((message, index) => (
        <div key={index} className="flex flex-col border rounded">
          <div className="font-medium text-sm text-secondary-foreground border-b p-2">
            {message.role.toUpperCase()}
          </div>
          <div>
            {isStringType(message.content) ? (
              <ContentPartText text={message.content} />
            ) : (
              <ContentParts contentParts={message.content} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
