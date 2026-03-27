import { capitalize } from "lodash";
import { Bolt, Brain, ChevronDown, ChevronUp } from "lucide-react";
import { memo, type PropsWithChildren, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import ImageWithPreview from "@/components/playground/image-with-preview";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { spanViewTheme } from "@/components/ui/content-renderer/utils";
import DownloadButton from "@/components/ui/download-button";
import PdfRenderer from "@/components/ui/pdf-renderer";
import { isStorageUrl } from "@/lib/s3";
import { cn } from "@/lib/utils";

interface RoleColorConfig {
  border: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
}

const ROLE_COLORS: Record<string, RoleColorConfig> = {
  system: {
    border: "hsl(215, 15%, 40%)",
    badgeBg: "hsl(215, 15%, 15%)",
    badgeBorder: "hsl(215, 15%, 25%)",
    badgeText: "hsl(215, 15%, 65%)",
  },
  user: {
    border: "hsl(217, 91%, 60%)",
    badgeBg: "hsl(217, 60%, 12%)",
    badgeBorder: "hsl(217, 50%, 25%)",
    badgeText: "hsl(217, 80%, 70%)",
  },
  assistant: {
    border: "hsl(262, 83%, 58%)",
    badgeBg: "hsl(262, 50%, 12%)",
    badgeBorder: "hsl(262, 40%, 25%)",
    badgeText: "hsl(262, 70%, 70%)",
  },
  tool: {
    border: "hsl(42, 93%, 46%)",
    badgeBg: "hsl(42, 60%, 12%)",
    badgeBorder: "hsl(42, 50%, 25%)",
    badgeText: "hsl(42, 80%, 65%)",
  },
};

const ROLE_ALIASES: Record<string, string> = {
  human: "user",
  ai: "assistant",
  model: "assistant",
  computer_call_output: "tool",
};

export function getRoleColors(role?: string): RoleColorConfig {
  if (!role) return ROLE_COLORS.system;
  const normalized = ROLE_ALIASES[role.toLowerCase()] ?? role.toLowerCase();
  return ROLE_COLORS[normalized] ?? ROLE_COLORS.system;
}

interface ToolCallContentPartProps {
  toolName: string;
  toolCallId?: string;
  content: unknown;
  presetKey: string;
  messageIndex?: number;
  contentPartIndex?: number;
}

const PureToolCallContentPart = ({
  toolName,
  toolCallId,
  content,
  presetKey,
  messageIndex = 0,
  contentPartIndex = 0,
}: ToolCallContentPartProps) => (
  <div className="flex flex-col gap-2 p-2 bg-background">
    <span
      className="flex items-center gap-1.5 text-xs font-medium"
      style={{ color: ROLE_COLORS.tool.badgeText, opacity: 0.85 }}
    >
      <Bolt size={14} className="min-w-3.5" />
      {toolName}
      {toolCallId && toolCallId !== toolName && <span className="opacity-50 font-normal">{toolCallId}</span>}
    </span>
    <ContentRenderer
      readOnly
      defaultMode="json"
      codeEditorClassName="rounded"
      value={JSON.stringify(content, null, 2)}
      presetKey={`editor-${presetKey}`}
      className="border-0 bg-card"
      messageIndex={messageIndex}
      contentPartIndex={contentPartIndex}
      customTheme={spanViewTheme}
    />
  </div>
);

interface ToolResultContentPartProps {
  toolCallId: string;
  toolName?: string;
  content: string | any;
  presetKey: string;
  children?: ReactNode;
}

const PureToolResultContentPart = ({
  toolCallId,
  toolName,
  content,
  presetKey,
  children,
}: ToolResultContentPartProps) => (
  <div className="flex flex-col gap-2 p-2 bg-background">
    <span
      className="flex items-center gap-1.5 text-xs font-medium"
      style={{ color: ROLE_COLORS.tool.badgeText, opacity: 0.85 }}
    >
      <Bolt size={14} className="min-w-3.5" />
      {toolName ?? toolCallId}
      {toolName && toolCallId !== toolName && <span className="opacity-50 font-normal">{toolCallId}</span>}
    </span>
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
}: TextContentPartProps) => (
  <div>
    <ContentRenderer
      defaultMode="json"
      readOnly
      value={content}
      presetKey={`editor-${presetKey}`}
      className={cn("border-0 bg-card", className)}
      codeEditorClassName={codeEditorClassName}
      messageIndex={messageIndex}
      contentPartIndex={contentPartIndex}
      customTheme={spanViewTheme}
    />
  </div>
);

interface RoleHeaderProps {
  role?: string;
  className?: string;
}

export const RoleHeader = ({ role, className }: RoleHeaderProps) => {
  if (role) {
    const colors = getRoleColors(role);
    return (
      <div className={cn("flex items-center px-2 py-1 gap-2 border-b bg-background", className)}>
        <span className="text-sm font-medium" style={{ color: colors.badgeText }}>
          {capitalize(role)}
        </span>
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
}: ThinkingContentPartProps) => (
  <div className="flex flex-col gap-2 p-2 bg-background">
    <span className="flex items-center text-xs">
      <Brain size={12} className="min-w-3 mr-2" />
      {label}
    </span>
    <ContentRenderer
      readOnly
      defaultMode="json"
      codeEditorClassName="rounded"
      value={content}
      presetKey={`editor-${presetKey}`}
      className="border-0 bg-card"
      messageIndex={messageIndex}
      contentPartIndex={contentPartIndex}
      customTheme={spanViewTheme}
    />
  </div>
);

export const ImageContentPart = memo(PureImageContentPart);
export const TextContentPart = memo(PureTextContentPart);
export const ThinkingContentPart = memo(PureThinkingContentPart);
export const FileContentPart = memo(PureFileContentPart);
export const ToolCallContentPart = memo(PureToolCallContentPart);
export const ToolResultContentPart = memo(PureToolResultContentPart);

const DEFAULT_MESSAGE_MAX_HEIGHT = 360;

export const MessageWrapper = ({
  children,
  role,
  maxHeight = DEFAULT_MESSAGE_MAX_HEIGHT,
}: PropsWithChildren<{
  role?: string;
  presetKey: string;
  maxHeight?: number;
}>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setIsOverflowing(el.scrollHeight > maxHeight);
  }, [maxHeight]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    checkOverflow();

    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(el);

    return () => resizeObserver.disconnect();
  }, [checkOverflow]);

  const isCapped = !isExpanded && isOverflowing;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={cn("border rounded overflow-hidden bg-card", isExpanded && isOverflowing && "pb-4")}
        style={!isExpanded ? { maxHeight } : undefined}
      >
        <RoleHeader role={role} />
        <div className="flex flex-col divide-y">{children}</div>
        {isCapped && (
          <button
            onClick={() => setIsExpanded(true)}
            className="absolute bottom-px left-px right-px h-16 bg-gradient-to-t from-background to-transparent rounded-b cursor-pointer flex items-end justify-center"
          >
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
      {isExpanded && isOverflowing && (
        <button
          onClick={() => setIsExpanded(false)}
          className="absolute bottom-px left-px right-px h-8 bg-gradient-to-t from-background to-transparent rounded-b cursor-pointer flex items-end justify-center"
        >
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
};
