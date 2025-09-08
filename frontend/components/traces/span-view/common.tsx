import { Bolt, ChevronRight } from "lucide-react";
import { Resizable } from "re-resizable";
import React, { memo, PropsWithChildren, ReactNode } from "react";

import ImageWithPreview from "@/components/playground/image-with-preview";
import { createStorageKey, useSpanViewStore } from "@/components/traces/span-view/span-view-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import DownloadButton from "@/components/ui/download-button";
import PdfRenderer from "@/components/ui/pdf-renderer";
import { useOptionalSearchContext } from "@/contexts/search-context";
import { isStorageUrl } from "@/lib/s3";
import { cn } from "@/lib/utils";

interface ResizableWrapperProps {
  children: ReactNode;
  height: number | null;
  onHeightChange: (height: number) => void;
  maxHeight?: number;
  className?: string;
}

export const ResizableWrapper = ({
  children,
  height,
  onHeightChange,
  maxHeight = 400,
  className,
}: ResizableWrapperProps) => {
  const currentHeight = height !== null ? height : "auto";
  return (
    <Resizable
      size={{ width: "100%", height: currentHeight }}
      maxHeight={height !== null ? undefined : maxHeight}
      onResizeStop={(_e, _direction, ref, _d) => {
        const newHeight = ref.offsetHeight;
        onHeightChange(newHeight);
      }}
      enable={{
        bottom: true,
      }}
      className={cn("relative flex h-full w-full", className)}
    >
      {children}
    </Resizable>
  );
};

interface ToolCallContentPartProps {
  toolName: string;
  content: unknown;
  type: "input" | "output";
  presetKey: string;
}

const PureToolCallContentPart = ({ toolName, type, content, presetKey }: ToolCallContentPartProps) => {
  const storageKey = createStorageKey.resize(type, presetKey);
  const setHeight = useSpanViewStore((state) => state.setHeight);
  const height = useSpanViewStore((state) => state.heights.get(storageKey) || null);
  const searchContext = useOptionalSearchContext();

  return (
    <div className="flex flex-col gap-2 p-2 bg-background">
      <span className="flex items-center text-xs">
        <Bolt size={12} className="min-w-3 mr-2" />
        {toolName}
      </span>
      <ResizableWrapper height={height} onHeightChange={setHeight(storageKey)} className="border-0">
        <CodeHighlighter
          readOnly
          defaultMode="json"
          codeEditorClassName="rounded"
          value={JSON.stringify(content, null, 2)}
          presetKey={createStorageKey.editor(type, presetKey)}
          className="border-0"
          searchTerm={searchContext?.searchTerm}
        />
      </ResizableWrapper>
    </div>
  );
};

interface ToolResultContentPartProps {
  toolCallId: string;
  content: string | any;
  type: "input" | "output";
  presetKey: string;
  children?: ReactNode;
}

const PureToolResultContentPart = ({ toolCallId, content, type, presetKey, children }: ToolResultContentPartProps) => (
  <div className="flex flex-col">
    <Badge className="w-fit m-1 font-medium" variant="secondary">
      ID: {toolCallId}
    </Badge>
    {children || (
      <TextContentPart
        type={type}
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
  presetKey: string;
  type: "input" | "output";
  className?: string;
  codeEditorClassName?: string;
}

const PureTextContentPart = ({
  content,
  type,
  presetKey,
  className = "border-0",
  codeEditorClassName,
}: TextContentPartProps) => {
  const storageKey = createStorageKey.resize(type, presetKey);
  const setHeight = useSpanViewStore((state) => state.setHeight);
  const height = useSpanViewStore((state) => state.heights.get(storageKey) || null);
  const searchContext = useOptionalSearchContext();

  return (
    <ResizableWrapper height={height} onHeightChange={setHeight(storageKey)} className={className}>
      <CodeHighlighter
        defaultMode="json"
        readOnly
        value={content}
        presetKey={createStorageKey.editor(type, presetKey)}
        className="border-0"
        codeEditorClassName={codeEditorClassName}
        searchTerm={searchContext?.searchTerm}
      />
    </ResizableWrapper>
  );
};

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
}: PropsWithChildren<{
  role?: string;
  presetKey: string;
}>) => {
  const { collapsed, toggleCollapse } = useSpanViewStore((state) => ({
    collapsed: state.isCollapsed,
    toggleCollapse: state.toggleCollapse,
  }));

  return (
    <div className="border rounded mb-4 overflow-hidden flex">
      <Collapsible
        open={!collapsed(presetKey)}
        onOpenChange={() => toggleCollapse(presetKey)}
        className="group/message-wrapper divide-y flex flex-col flex-1 w-full"
      >
        <RoleHeader role={role} />
        <CollapsibleContent className="flex h-full flex-col divide-y overflow-hidden">{children}</CollapsibleContent>
      </Collapsible>
    </div>
  );
};
