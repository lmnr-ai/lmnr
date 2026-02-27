import { Bolt, Brain, ChevronRight, GripHorizontal } from "lucide-react";
import { Resizable } from "re-resizable";
import React, { memo, type PropsWithChildren, type ReactNode } from "react";

import ImageWithPreview from "@/components/playground/image-with-preview";
import { useSpanSearchContext } from "@/components/traces/span-view/span-search-context";
import { useSpanViewStore } from "@/components/traces/span-view/span-view-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ContentRenderer from "@/components/ui/content-renderer/index";
import DownloadButton from "@/components/ui/download-button";
import PdfRenderer from "@/components/ui/pdf-renderer";
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
      onResizeStart={(_e, _direction, ref) => {
        if (height === null) {
          const actualHeight = ref.offsetHeight;
          onHeightChange(actualHeight);
        }
      }}
      onResizeStop={(_e, _direction, ref, _d) => {
        const newHeight = ref.offsetHeight;
        onHeightChange(newHeight);
      }}
      enable={{
        bottom: true,
      }}
      handleComponent={{
        bottom: (
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center w-full h-0 bg-background/90 backdrop-blur-sm">
            <div className="flex items-end justify-center w-full overflow-hidden h-2">
              <GripHorizontal className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        ),
      }}
      handleStyles={{
        bottom: { height: 0, bottom: 0 },
      }}
      handleWrapperStyle={{
        height: 0,
      }}
      className={cn("relative flex w-full", className)}
    >
      <div className="overflow-auto w-full">{children}</div>
    </Resizable>
  );
};

interface ToolCallContentPartProps {
  toolName: string;
  content: unknown;
  presetKey: string;
  messageIndex?: number;
  contentPartIndex?: number;
}

const PureToolCallContentPart = ({
  toolName,
  content,
  presetKey,
  messageIndex = 0,
  contentPartIndex = 0,
}: ToolCallContentPartProps) => {
  const storageKey = `resize-${presetKey}`;
  const setHeight = useSpanViewStore((state) => state.setHeight);
  const height = useSpanViewStore((state) => state.heights.get(storageKey) || null);
  const searchContext = useSpanSearchContext();

  return (
    <div className="flex flex-col gap-2 p-2 bg-background">
      <span className="flex items-center text-xs">
        <Bolt size={12} className="min-w-3 mr-2" />
        {toolName}
      </span>
      <ResizableWrapper height={height} onHeightChange={setHeight(storageKey)} className="border-0">
        <ContentRenderer
          readOnly
          defaultMode="json"
          codeEditorClassName="rounded"
          value={JSON.stringify(content, null, 2)}
          presetKey={`editor-${presetKey}`}
          className="border-0 bg-muted/50"
          searchTerm={searchContext?.searchTerm || ""}
          messageIndex={messageIndex}
          contentPartIndex={contentPartIndex}
        />
      </ResizableWrapper>
    </div>
  );
};

interface ToolResultContentPartProps {
  toolCallId: string;
  content: string | any;
  presetKey: string;
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
  presetKey: string;
  className?: string;
  codeEditorClassName?: string;
  messageIndex?: number;
  contentPartIndex?: number;
}

const PureTextContentPart = ({
  content,
  presetKey,
  className = "border-0",
  codeEditorClassName,
  messageIndex = 0,
  contentPartIndex = 0,
}: TextContentPartProps) => {
  const storageKey = `resize-${presetKey}`;
  const setHeight = useSpanViewStore((state) => state.setHeight);
  const height = useSpanViewStore((state) => state.heights.get(storageKey) || null);
  const searchContext = useSpanSearchContext();

  return (
    <ResizableWrapper height={height} onHeightChange={setHeight(storageKey)} className={className}>
      <ContentRenderer
        defaultMode="json"
        readOnly
        value={content}
        presetKey={`editor-${presetKey}`}
        className="border-0 bg-muted/50"
        codeEditorClassName={codeEditorClassName}
        searchTerm={searchContext?.searchTerm || ""}
        messageIndex={messageIndex}
        contentPartIndex={contentPartIndex}
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

interface ThinkingContentPartProps {
  content: string;
  label?: string;
  presetKey: string;
  messageIndex?: number;
  contentPartIndex?: number;
}

const PureThinkingContentPart = ({
  content,
  label = "Thinking",
  presetKey,
  messageIndex = 0,
  contentPartIndex = 0,
}: ThinkingContentPartProps) => {
  const storageKey = `resize-${presetKey}`;
  const setHeight = useSpanViewStore((state) => state.setHeight);
  const height = useSpanViewStore((state) => state.heights.get(storageKey) || null);
  const searchContext = useSpanSearchContext();

  return (
    <div className="flex flex-col gap-2 p-2 bg-background">
      <span className="flex items-center text-xs">
        <Brain size={12} className="min-w-3 mr-2" />
        {label}
      </span>
      <ResizableWrapper height={height} onHeightChange={setHeight(storageKey)} className="border-0">
        <ContentRenderer
          readOnly
          defaultMode="json"
          codeEditorClassName="rounded"
          value={content}
          presetKey={`editor-${presetKey}`}
          className="border-0 bg-muted/50"
          searchTerm={searchContext?.searchTerm || ""}
          messageIndex={messageIndex}
          contentPartIndex={contentPartIndex}
        />
      </ResizableWrapper>
    </div>
  );
};

export const ImageContentPart = memo(PureImageContentPart);
export const TextContentPart = memo(PureTextContentPart);
export const ThinkingContentPart = memo(PureThinkingContentPart);
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
        <CollapsibleContent className="flex flex-col divide-y">{children}</CollapsibleContent>
      </Collapsible>
    </div>
  );
};
