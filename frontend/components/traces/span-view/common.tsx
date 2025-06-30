import { Bolt, ChevronRight } from "lucide-react";
import React, { memo, PropsWithChildren, ReactNode, Ref } from "react";

import ImageWithPreview from "@/components/playground/image-with-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import DownloadButton from "@/components/ui/download-button";
import PdfRenderer from "@/components/ui/pdf-renderer";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { isStorageUrl } from "@/lib/s3";
import { cn } from "@/lib/utils";

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
  role?: string;
  className?: string;
}

export const RoleHeader = ({ role, className }: RoleHeaderProps) => {
  if (role) {
    return (
      <div className={cn("flex items-center font-medium text-sm text-secondary-foreground px-2 py-1", className)}>
        <span>{role.toUpperCase()}</span>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon" className="w-6 h-6 ml-auto focus-visible:ring-0">
            <ChevronRight className="w-4 h-4 text-muted-foreground group-data-[state=open]/message-wrapper:rotate-90 transition-transform duration-200" />
          </Button>
        </CollapsibleTrigger>
      </div>
    );
  }
  return null;
};

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

export const MessageWrapper = ({
  children,
  role,
  presetKey,
  ref,
}: PropsWithChildren<{
  role?: string;
  presetKey: string;
  ref: Ref<HTMLDivElement>;
}>) => {
  const [isOpen, setIsOpen] = useLocalStorage(presetKey, true);

  return (
    <div ref={ref} className="border rounded mb-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group/message-wrapper divide-y">
        <RoleHeader role={role} />
        <CollapsibleContent className="flex flex-col divide-y">{children}</CollapsibleContent>
      </Collapsible>
    </div>
  );
};
