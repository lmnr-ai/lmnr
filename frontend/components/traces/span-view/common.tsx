import { capitalize } from "lodash";
import { Bolt, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { memo, type PropsWithChildren, type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";

import ImageWithPreview from "@/components/playground/image-with-preview";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { spanViewTheme } from "@/components/ui/content-renderer/utils";
import DownloadButton from "@/components/ui/download-button";
import PdfRenderer from "@/components/ui/pdf-renderer";
import { ElevatedSurface } from "@/components/ui/surface";
import { resolveContentMode } from "@/lib/spans/resolve-content-mode";
import { canonicalRole } from "@/lib/spans/turn";
import { cn } from "@/lib/utils";

// Hue tokens live in app/globals.css (--{hue}-text); only the role → hue choice is made here.
const ROLE_TEXT_COLORS: Record<string, string> = {
  system: "var(--slate-text)",
  user: "var(--blue-text)",
  assistant: "var(--purple-text)",
  tool: "var(--yellow-text)",
};

export function getRoleTextColor(role?: string): string {
  return ROLE_TEXT_COLORS[canonicalRole(role) ?? "system"] ?? ROLE_TEXT_COLORS.system;
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
}: ToolCallContentPartProps) => {
  const { mode, modes, value } = resolveContentMode(content);
  return (
    <div className="flex flex-col gap-2 p-2">
      <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: ROLE_TEXT_COLORS.tool }}>
        <Bolt size={14} className="min-w-3.5" />
        {toolName}
        {toolCallId && toolCallId !== toolName && <span className="opacity-50 font-normal">{toolCallId}</span>}
      </span>
      <ContentRenderer
        readOnly
        defaultMode={mode}
        modes={modes}
        codeEditorClassName="rounded"
        value={value}
        presetKey={`editor-${presetKey}`}
        className="border-0"
        messageIndex={messageIndex}
        contentPartIndex={contentPartIndex}
        customTheme={spanViewTheme}
      />
    </div>
  );
};

interface ToolResultContentPartProps {
  toolCallId: string;
  toolName?: string;
  content: string | any;
  presetKey: string;
  children?: ReactNode;
  messageIndex?: number;
  contentPartIndex?: number;
}

const PureToolResultContentPart = ({
  toolCallId,
  toolName,
  content,
  presetKey,
  children,
  messageIndex = 0,
  contentPartIndex = 0,
}: ToolResultContentPartProps) => {
  const { mode, modes, value } = resolveContentMode(content);
  return (
    <div className="flex flex-col gap-2 p-2">
      <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: ROLE_TEXT_COLORS.tool }}>
        <Bolt size={14} className="min-w-3.5" />
        {toolName ?? toolCallId}
        {toolName && toolCallId !== toolName && <span className="opacity-50 font-normal">{toolCallId}</span>}
      </span>
      {children || (
        <ContentRenderer
          readOnly
          defaultMode={mode}
          modes={modes}
          codeEditorClassName="rounded"
          value={value}
          presetKey={`editor-${presetKey}`}
          className="border-0"
          messageIndex={messageIndex}
          contentPartIndex={contentPartIndex}
          customTheme={spanViewTheme}
        />
      )}
    </div>
  );
};

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
  const { mode, modes, value } = resolveContentMode(content);
  return (
    <div>
      <ContentRenderer
        defaultMode={mode}
        modes={modes}
        readOnly
        value={value}
        presetKey={`editor-${presetKey}`}
        className={cn("border-0", className)}
        codeEditorClassName={codeEditorClassName}
        messageIndex={messageIndex}
        contentPartIndex={contentPartIndex}
        customTheme={spanViewTheme}
      />
    </div>
  );
};

interface RoleHeaderProps {
  role?: string;
  className?: string;
  action?: ReactNode;
}

const RoleHeader = ({ role, className, action }: RoleHeaderProps) => {
  if (role) {
    return (
      // emphasis is translucent; layer it over bg-surface so the sticky header stays opaque.
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1 border-b rounded-t bg-surface bg-linear-to-b from-emphasis-2 to-emphasis-2 dark:from-emphasis-1 dark:to-emphasis-1",
          className
        )}
      >
        <span className="text-sm font-medium" style={{ color: getRoleTextColor(role) }}>
          {capitalize(role)}
        </span>
        {action}
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
}: ImageContentPartProps) => <ImageWithPreview src={src} className={className} alt={alt} />;

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
  <div className="flex flex-col gap-2 p-2">
    <span className="flex items-center text-xs">
      <Lightbulb size={14} className="min-w-3.5 mr-2 text-muted-foreground" />
      {label}
    </span>
    <ContentRenderer
      readOnly
      defaultMode="text"
      modes={["TEXT"]}
      codeEditorClassName="rounded"
      value={content}
      presetKey={`editor-${presetKey}`}
      className="border-0"
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
  stickyHeader = true,
  defaultExpanded = false,
  headerAction,
  highlighted = false,
}: PropsWithChildren<{
  role?: string;
  /** Right-aligned in the role header; revealed on hover via `group-hover/span-message`. */
  headerAction?: ReactNode;
  /** Briefly marks the message a link opened. */
  highlighted?: boolean;
  presetKey: string;
  maxHeight?: number;
  stickyHeader?: boolean;
  defaultExpanded?: boolean;
}>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const checkOverflow = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setIsOverflowing(el.scrollHeight > maxHeight);
  }, [maxHeight]);

  // Layout effect: the expand toggle adds height, and it must land before paint. Added a frame later, a card scrolled
  // in from above grows under the virtualizer, which leaves that to the browser's scroll anchoring and eats the scroll.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    checkOverflow();

    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(el);

    return () => resizeObserver.disconnect();
  }, [checkOverflow]);

  const showToggle = isOverflowing;

  return (
    // overflow-clip (not hidden): clips to radius without creating a scroll
    // container, so sticky can still pin to the messages list.
    <ElevatedSurface
      offset={1}
      className={cn("group/span-message relative border rounded-lg overflow-clip", highlighted && FLASH)}
    >
      <RoleHeader role={role} action={headerAction} className={stickyHeader ? "sticky top-0 z-10" : undefined} />
      <div
        ref={containerRef}
        className="overflow-hidden bg-emphasis-1 dark:bg-transparent"
        style={!isExpanded ? { maxHeight } : undefined}
      >
        <div className="flex flex-col divide-y">{children}</div>
      </div>
      {showToggle && (
        <div className="sticky bottom-0 z-30 flex flex-col items-center rounded-b-lg">
          <div
            className="w-full pointer-events-none bg-gradient-to-b from-background/0 to-background"
            style={{
              height: isExpanded ? 16 : 36,
              marginTop: isExpanded ? -8 : -36,
            }}
          />
          <div className="w-full bg-background rounded-b-lg">
            <button
              onClick={() => setIsExpanded((prev) => !prev)}
              className="h-3 relative w-full flex items-center justify-center cursor-pointer rounded-b-lg"
            >
              <span className="absolute -top-2.5 w-full flex justify-center">
                {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </span>
            </button>
          </div>
        </div>
      )}
    </ElevatedSurface>
  );
};

// Drawn over the card's own border, so the flash needs no layout or state.
const FLASH = "outline outline-1 -outline-offset-1 outline-transparent animate-link-flash";
