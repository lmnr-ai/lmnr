import { capitalize } from "lodash";
import { Bolt, Lightbulb } from "lucide-react";
import { memo, type PropsWithChildren, type ReactNode, useRef } from "react";

import ImageWithPreview from "@/components/playground/image-with-preview";
import { MessageRole } from "@/components/traces/span-view/collapsible";
import HeightClamp from "@/components/traces/span-view/height-clamp";
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
}

const PureToolCallContentPart = ({ toolName, toolCallId, content, presetKey }: ToolCallContentPartProps) => {
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
}

const PureToolResultContentPart = ({
  toolCallId,
  toolName,
  content,
  presetKey,
  children,
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
}

const PureTextContentPart = ({
  content,
  presetKey,
  className = "border-0",
  codeEditorClassName,
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

export const RoleHeader = ({ role, className, action }: RoleHeaderProps) => {
  if (role) {
    return (
      // emphasis is translucent; layer it over bg-surface so the sticky header stays opaque.
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1 border-b bg-surface bg-linear-to-b from-emphasis-2 to-emphasis-2 dark:from-emphasis-1 dark:to-emphasis-1",
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

/**
 * A card's rounded top with its role header. The square backdrop is the list's own surface: pinned mid-card, it hides
 * the body's side borders behind the rounded corners.
 */
export const RoleTab = ({ sticky = false, ...props }: Omit<RoleHeaderProps, "className"> & { sticky?: boolean }) => (
  // Sticky: pinned to the list's top (below the opened-context band, via `--band-inset`) while its card spans it.
  <div
    data-sticky-header={sticky || undefined}
    className={cn("bg-surface", sticky && "sticky top-[var(--band-inset,0px)] z-10")}
  >
    <ElevatedSurface offset={1} className="border border-b-0 rounded-t-lg overflow-clip">
      <RoleHeader {...props} />
    </ElevatedSurface>
  </div>
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
}: ImageContentPartProps) => <ImageWithPreview src={src} className={className} alt={alt} />;

interface ThinkingContentPartProps {
  content: string;
  label?: string;
  presetKey: string;
}

const PureThinkingContentPart = ({ content, label = "Thinking", presetKey }: ThinkingContentPartProps) => (
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
  defaultExpanded = false,
  hasMatches = false,
  headerAction,
  highlighted = false,
}: PropsWithChildren<{
  role?: string;
  /** Right-aligned in the role header; revealed on hover via `group-hover/span-message`. */
  headerAction?: ReactNode;
  /** Briefly marks the message a link opened. */
  highlighted?: boolean;
  maxHeight?: number;
  defaultExpanded?: boolean;
  /** Holds search matches, so the clamp stays open. */
  hasMatches?: boolean;
}>) => {
  const cardRef = useRef<HTMLDivElement>(null);
  return (
    // The tab sits outside the body's clip so, pinned, it can cover the body's side borders.
    <div ref={cardRef} className="group/span-message relative rounded-lg scroll-mt-16">
      {role && <RoleTab role={role} action={headerAction} sticky />}
      {/* overflow-clip (not hidden): clips to radius without creating a scroll container, so sticky still pins. */}
      <ElevatedSurface
        offset={1}
        className={cn("border overflow-clip", role ? "border-t-0 rounded-b-lg" : "rounded-lg")}
      >
        <div className="bg-emphasis-1 dark:bg-transparent">
          <MessageRole value={role}>
            <HeightClamp
              maxHeight={maxHeight}
              defaultExpanded={defaultExpanded}
              hasMatches={hasMatches}
              anchorRef={cardRef}
            >
              <div className="flex flex-col divide-y">{children}</div>
            </HeightClamp>
          </MessageRole>
        </div>
      </ElevatedSurface>
      {highlighted && <div className={FLASH} />}
    </div>
  );
};

// Its own layer over the card's border, above the sticky tab (z-10), which would otherwise paint over the outline.
const FLASH =
  "pointer-events-none absolute inset-0 z-20 rounded-lg outline outline-1 -outline-offset-1 outline-transparent animate-link-flash";
