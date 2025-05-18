import CodeMirror, { Extension } from "@uiw/react-codemirror";
import { Maximize, Minimize } from "lucide-react";
import React, { memo, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { createImageDecorationPlugin, modes, renderText, theme } from "@/components/ui/code-highlighter/utils";
import { CopyButton } from "@/components/ui/copy-button";
import { DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface CodeSheetProps {
  renderedValue: string;
  mode: string;
  onModeChange: (mode: string) => void;
  extensions: Extension[];
  placeholder?: string;
}

const PureCodeSheet = ({ mode, renderedValue, extensions, onModeChange, placeholder }: CodeSheetProps) => {
  // Process the value using the new renderText function
  const { text: processedText, imageMap, hasImages } = useMemo(() => {
    return renderText(mode, renderedValue, true);
  }, [mode, renderedValue]);

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
        <Button variant="ghost" size="icon">
          <Maximize className="h-3.5 w-3.5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-0 min-w-[50vw]">
        <DialogTitle className="hidden"></DialogTitle>
        <div className="flex-none border-b items-center flex px-2 justify-between">
          <div className="flex justify-start">
            <Select value={mode} onValueChange={onModeChange}>
              <SelectTrigger className="font-medium text-secondary-foreground bg-secondary text-xs border-gray-600 h-6">
                <SelectValue placeholder="Select tag type" />
              </SelectTrigger>
              <SelectContent>
                {modes.map((mode) => (
                  <SelectItem key={mode} value={mode.toLowerCase()}>
                    {mode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <CopyButton iconClassName="h-3.5 w-3.5" size="icon" variant="ghost" text={renderedValue} />
            <SheetClose asChild>
              <Button variant="ghost" size="icon">
                <Minimize className="h-4 w-4" />
              </Button>
            </SheetClose>
          </div>
        </div>
        <ScrollArea className="flex-grow">
          <div className="flex flex-col bg-card">
            <CodeMirror
              placeholder={placeholder}
              theme={theme}
              className="h-full"
              extensions={combinedExtensions}
              value={processedText}
              readOnly={true}
            />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

const CodeSheet = memo(PureCodeSheet);

export default CodeSheet;
