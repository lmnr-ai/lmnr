import { Bolt } from "lucide-react";
import { memo, ReactNode } from "react";

import ImageWithPreview from "@/components/playground/image-with-preview";
import { Badge } from "@/components/ui/badge";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import DownloadButton from "@/components/ui/download-button";
import PdfRenderer from "@/components/ui/pdf-renderer";
import { isStorageUrl } from "@/lib/s3";

interface ToolCallContentPartProps {
  toolName: string;
  content: unknown;
  presetKey?: string;
}

const PureToolCallContentPart = ({ toolName, content, presetKey }: ToolCallContentPartProps) => (
  <div className="flex flex-col gap-2 p-2 bg-background">
    <span className="flex items-center text-xs">
      <Bolt size={12} className="min-w-3 mr-2" />
      {toolName}
    </span>
    <CodeHighlighter
      readOnly
      codeEditorClassName="rounded"
      value={JSON.stringify(content, null, 2)}
      presetKey={presetKey}
      className="max-h-[400px] border-0"
    />
  </div>
);

interface ToolResultContentPartProps {
  toolCallId: string;
  content: string | any;
  presetKey?: string;
  children?: ReactNode;
}

const PureToolResultContentPart = ({ toolCallId, content, presetKey, children }: ToolResultContentPartProps) => (
  <div className="flex flex-col">
    <Badge className="w-fit m-1 font-medium" variant="secondary">
      ID: {toolCallId}
    </Badge>
    {children || (
      <TextContentPart
        content={typeof content === "string" ? content : JSON.stringify(content, null, 2)}
        presetKey={presetKey}
      />
    )}
  </div>
);

interface FileContentPartProps {
  data: string;
  filename?: string;
  className?: string;
}

const PureFileContentPart = ({ data, filename, className }: FileContentPartProps) => {
  if (data.endsWith(".pdf")) {
    return <PdfRenderer url={data} className={className || "w-full h-[50vh]"} />;
  }

  return <DownloadButton uri={data} filenameFallback={filename || data} supportedFormats={[]} variant="outline" />;
};

interface TextContentPartProps {
  content: string;
  presetKey?: string;
  className?: string;
  codeEditorClassName?: string;
}

const PureTextContentPart = ({
  content,
  presetKey,
  className = "max-h-[400px] border-0",
  codeEditorClassName,
}: TextContentPartProps) => (
  <CodeHighlighter
    readOnly
    value={content}
    presetKey={presetKey}
    className={className}
    codeEditorClassName={codeEditorClassName}
  />
);

interface RoleHeaderProps {
  role: string;
  className?: string;
}

export const RoleHeader = ({ role, className }: RoleHeaderProps) => (
  <div className={className || "font-medium text-sm text-secondary-foreground p-2"}>{role.toUpperCase()}</div>
);

interface ImageContentPartProps {
  src: string;
  className?: string;
  alt?: string;
}

const PureImageContentPart = ({
  src,
  className = "object-cover rounded-sm size-16 m-2",
  alt = "span image",
}: ImageContentPartProps) => {
  const imageUrl = isStorageUrl(src) ? `${src}?payloadType=image` : src;

  return <ImageWithPreview src={imageUrl} className={className} alt={alt} />;
};

export const ImageContentPart = memo(PureImageContentPart);
export const TextContentPart = memo(PureTextContentPart);
export const FileContentPart = memo(PureFileContentPart);
export const ToolCallContentPart = memo(PureToolCallContentPart);
export const ToolResultContentPart = memo(PureToolResultContentPart);
