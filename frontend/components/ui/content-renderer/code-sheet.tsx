import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import { Maximize, Minimize } from "lucide-react";
import React, { memo, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { createImageDecorationPlugin, renderText, theme } from "@/components/ui/content-renderer/utils";
import { CopyButton } from "@/components/ui/copy-button";
import { DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  TemplatePickerActions,
  TemplatePickerPreview,
  TemplatePickerView,
} from "@/components/ui/template-renderer/template-picker";

interface CodeSheetProps {
  renderedValue: string;
  mode: string;
  onModeChange: (mode: string) => void;
  modes: string[];
  extensions: Extension[];
  placeholder?: string;
}

const PureCodeSheet = ({ mode, modes, renderedValue, extensions, onModeChange, placeholder }: CodeSheetProps) => {
  const sheetModes = useMemo(() => modes.filter((m) => m.toLowerCase() !== "messages"), [modes]);
  const sheetMode = mode === "messages" ? "text" : mode;

  const {
    text: processedText,
    imageMap,
    hasImages,
  } = useMemo(() => renderText(sheetMode, renderedValue, true), [sheetMode, renderedValue]);

  // Add image rendering extensions if images are found
  const combinedExtensions = useMemo(() => {
    if (hasImages) {
      return [...extensions, createImageDecorationPlugin(imageMap)];
    }
    return extensions;
  }, [extensions, hasImages, imageMap]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="text-foreground/80">
          <Maximize className="h-3.5 w-3.5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-0 min-w-[50vw]">
        <div className="flex flex-col h-full bg-muted/50">
          <DialogTitle className="hidden"></DialogTitle>
          <div className="flex-none items-center flex px-2 justify-between">
            <div className="flex items-center gap-1">
              <TemplatePickerView mode={sheetMode} onModeChange={onModeChange} modes={sheetModes} />
              {sheetMode === "custom" && <TemplatePickerActions />}
            </div>
            <div className="flex items-center">
              <CopyButton iconClassName="h-3.5 w-3.5" size="icon" variant="ghost" text={renderedValue} />
              <SheetClose asChild>
                <Button variant="ghost" size="icon">
                  <Minimize className="h-4 w-4" />
                </Button>
              </SheetClose>
            </div>
          </div>
          <ScrollArea className="grow">
            <div className="flex flex-col">
              {sheetMode === "custom" ? (
                <TemplatePickerPreview data={renderedValue} />
              ) : (
                <CodeMirror
                  placeholder={placeholder}
                  theme={theme}
                  className="h-full"
                  extensions={combinedExtensions}
                  value={processedText}
                  readOnly={true}
                />
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const CodeSheet = memo(PureCodeSheet);

export default CodeSheet;
