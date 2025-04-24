import CodeMirror, { Extension } from "@uiw/react-codemirror";
import { Copy, Maximize, Minimize } from "lucide-react";
import React, { memo } from "react";

import { modes, theme } from "@/components/traces/code-highlighter/utils";
import { Button } from "@/components/ui/button";
import CopyToClipboardButton from "@/components/ui/copy-to-clipboard";
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
const PureCodeSheet = ({ mode, renderedValue, extensions, onModeChange, placeholder }: CodeSheetProps) => (
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
                <SelectItem key={mode} value={mode}>
                  {mode.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <CopyToClipboardButton className="h-7 w-7" text={renderedValue}>
            <Copy className="h-3.5 w-3.5" />
          </CopyToClipboardButton>
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
            extensions={extensions}
            value={renderedValue}
          />
        </div>
      </ScrollArea>
    </SheetContent>
  </Sheet>
);

const CodeSheet = memo(PureCodeSheet);

export default CodeSheet;
