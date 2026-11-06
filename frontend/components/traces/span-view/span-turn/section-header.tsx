import { memo, useMemo } from "react";

import MessageLabelRow from "@/components/traces/span-view/message-label-row";
import CopyMenu, { type CopyOption } from "@/components/traces/span-view/span-turn/copy-menu";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { renderText, spanViewTheme } from "@/components/ui/content-renderer/utils";
import { CopyButton } from "@/components/ui/copy-button";
import {
  TemplatePickerActions,
  TemplatePickerPreview,
  TemplatePickerProvider,
  TemplatePickerView,
} from "@/components/ui/template-renderer/template-picker";
import { cn } from "@/lib/utils";

export const SECTION_MODES = ["MESSAGES", "JSON", "YAML", "TEXT", "CUSTOM"];

export interface SectionFormat {
  /** Extra copy target next to the full payload, e.g. only this call's new input messages. */
  copyExtra?: CopyOption;
  mode: string;
  onModeChange: (mode: string) => void;
  /** Serialized payload, used for copy, raw modes and template test data. */
  value: string;
  /** The old Span Input / Span Output preset keys, so custom templates chosen there still apply. */
  templateKey: string;
}

interface SectionHeaderProps extends SectionFormat {
  title: string;
  /** What the section holds, e.g. "4 tool results". */
  summary?: string;
  messageIndex: number;
  /** First row of the list, so no gap above it. */
  first?: boolean;
}

// Same data ContentRenderer's custom mode hands templates (base64 images as placeholders), so existing templates
// render exactly as on the old Span Input / Span Output tabs.
const CustomPreview = ({ value }: { value: string }) => {
  const data = useMemo(() => renderText("custom", value, true).text, [value]);
  return <TemplatePickerPreview data={data} />;
};

/** Input / Output heading with its own format picker and copy; in a raw mode it also holds the payload. */
const SectionHeader = ({
  title,
  summary,
  mode,
  onModeChange,
  value,
  templateKey,
  copyExtra,
  messageIndex,
  first = false,
}: SectionHeaderProps) => (
  // The picker and the custom preview must share one provider: it holds the selected template.
  <TemplatePickerProvider presetKey={templateKey} testData={value}>
    <div className={cn("flex flex-col pb-2", !first && "pt-2")}>
      <div className="flex items-center gap-2 px-1">
        <MessageLabelRow text={title} />
        {summary && <span className="-ml-1 text-sm text-muted-foreground whitespace-nowrap">· {summary}</span>}
        <TemplatePickerView mode={mode} onModeChange={onModeChange} modes={SECTION_MODES} />
        {mode === "custom" && <TemplatePickerActions />}
        <div className="flex-1 border-t" />
        {copyExtra ? (
          <CopyMenu options={[{ label: `Copy full ${title.toLowerCase()}`, getText: () => value }, copyExtra]} />
        ) : (
          <CopyButton
            text={value}
            size="icon"
            variant="ghost"
            iconClassName="size-3.5"
            className="text-foreground/80"
          />
        )}
      </div>
      {mode !== "messages" && (
        <div className="mt-2 rounded-lg border overflow-hidden">
          {mode === "custom" ? (
            <CustomPreview value={value} />
          ) : (
            <ContentRenderer
              key={mode}
              readOnly
              value={value}
              defaultMode={mode}
              modes={[mode.toUpperCase()]}
              className="border-0"
              codeEditorClassName="rounded-none border-none"
              customTheme={spanViewTheme}
              messageIndex={messageIndex}
            />
          )}
        </div>
      )}
    </div>
  </TemplatePickerProvider>
);

export default memo(SectionHeader);
