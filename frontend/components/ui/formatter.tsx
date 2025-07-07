import { ChevronDown, ChevronUp, Maximize, Minimize } from "lucide-react";
import React, { useEffect, useState } from "react";
import YAML from "yaml";

import { CopyButton } from "@/components/ui/copy-button";
import TemplateRenderer from "@/components/ui/template-renderer";
import { cn } from "@/lib/utils";

import { Button } from "./button";
import CodeEditor from "./code-editor";
import { DialogTitle } from "./dialog";
import { ScrollArea } from "./scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "./sheet";

interface OutputFormatterProps {
  value: string;
  className?: string;
  defaultMode?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  collapsible?: boolean;
  presetKey?: string | null;
}

const modes = ["TEXT", "YAML", "JSON", "CUSTOM"];

export default function Formatter({
  value,
  defaultMode = "text",
  editable = false,
  onChange,
  className,
  collapsible = false,
  presetKey = null,
}: OutputFormatterProps) {
  const [renderedValue, setRenderedValue] = useState(value);
  const [mode, setMode] = useState(() => {
    if (presetKey && typeof window !== "undefined") {
      const savedMode = localStorage.getItem(`formatter-mode-${presetKey}`);
      return savedMode || defaultMode;
    }
    return defaultMode;
  });
  const [expandedValue, setExpandedValue] = useState(value);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    if (presetKey && typeof window !== "undefined") {
      localStorage.setItem(`formatter-mode-${presetKey}`, newMode);
    }
  };

  useEffect(() => {
    setRenderedValue(renderText(value));
  }, [value, mode]);

  const renderText = (value: string) => {
    if (mode === "yaml") {
      try {
        return YAML.stringify(YAML.parse(value));
      } catch (e) {
        return value;
      }
    } else if (mode === "json") {
      try {
        if (JSON.parse(value) === value) {
          return value;
        }
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch (e) {
        return value;
      }
    }

    return value;
  };

  return (
    <div className={cn("w-full h-full flex flex-col border rounded", className)}>
      <div className="flex w-full flex-none p-0">
        <div
          className={cn("flex justify-between items-center pl-2 pr-1 w-full border-b", isCollapsed ? "border-b-0" : "")}
        >
          <div className="flex items-center gap-2">
            <Select value={mode} onValueChange={handleModeChange}>
              <SelectTrigger className="font-medium text-secondary-foreground bg-secondary text-xs border-gray-600 h-5">
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
            {collapsible && (
              <Button
                variant="ghost"
                className="flex items-center gap-1 text-secondary-foreground"
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                {isCollapsed ? (
                  <>
                    show
                    <ChevronDown size={16} />
                  </>
                ) : (
                  <>
                    hide
                    <ChevronUp size={16} />
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <CopyButton
              className="h-7 w-7 ml-auto"
              iconClassName="h-3.5 w-3.5"
              size="icon"
              variant="ghost"
              text={renderedValue}
            />
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
                    <Select value={mode} onValueChange={handleModeChange}>
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
                    <CopyButton
                      className="h-7 w-7"
                      iconClassName="h-3.5 w-3.5"
                      size="icon"
                      variant="ghost"
                      text={renderedValue}
                    />
                    <SheetClose asChild>
                      <Button variant="ghost" size="icon">
                        <Minimize className="h-4 w-4" />
                      </Button>
                    </SheetClose>
                  </div>
                </div>
                <ScrollArea className="flex-grow">
                  <div className="flex flex-col">
                    {mode === "custom" ? (
                      <TemplateRenderer data={renderText(expandedValue)} presetKey={presetKey} />
                    ) : (
                      <CodeEditor
                        value={renderText(expandedValue)}
                        editable={editable}
                        language={mode}
                        onChange={(v) => {
                          setExpandedValue(v);
                          if (mode === "yaml") {
                            try {
                              const parsedYaml = YAML.parse(v);
                              onChange?.(JSON.stringify(parsedYaml, null, 2));
                            } catch (e) {
                              onChange?.(v);
                            }
                          } else {
                            onChange?.(v);
                          }
                        }}
                      />
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
      {!isCollapsed && (
        <div className="flex-grow flex overflow-auto w-full">
          {mode === "custom" ? (
            <TemplateRenderer data={renderedValue} presetKey={presetKey} />
          ) : (
            <CodeEditor
              value={renderedValue}
              editable={editable}
              language={mode}
              onChange={(v) => {
                setExpandedValue(v);
                if (mode === "yaml") {
                  try {
                    const parsedYaml = YAML.parse(v);
                    onChange?.(JSON.stringify(parsedYaml, null, 2));
                  } catch (e) {
                    onChange?.(v);
                  }
                } else {
                  onChange?.(v);
                }
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
