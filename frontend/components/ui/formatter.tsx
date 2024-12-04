import { ChevronDown, ChevronUp, Copy, Maximize, Minimize } from 'lucide-react';
import { useState } from 'react';
import YAML from 'yaml';

import { cn } from '@/lib/utils';

import { Button } from './button';
import CodeEditor from './code-editor';
import CopyToClipboardButton from './copy-to-clipboard';
import { DialogTitle } from './dialog';
import { ScrollArea } from './scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './select';
import { Sheet, SheetClose, SheetContent, SheetTrigger } from './sheet';

interface OutputFormatterProps {
  value: string;
  className?: string;
  defaultMode?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  collapsible?: boolean;
}

export default function Formatter({
  value,
  defaultMode = 'text',
  editable = false,
  onChange,
  className,
  collapsible = false
}: OutputFormatterProps) {
  const [mode, setMode] = useState(defaultMode);
  const [expandedValue, setExpandedValue] = useState(value);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const renderText = (value: string) => {
    // if mode is YAML try to parse it as YAML
    if (mode === 'yaml') {
      try {
        const yamlFormatted = YAML.stringify(JSON.parse(value));
        return yamlFormatted;
      } catch (e) {
        return value;
      }
    } else if (mode === 'json') {
      try {
        if (JSON.parse(value) === value) {
          return value;
        }

        const jsonFormatted = JSON.stringify(JSON.parse(value), null, 2);
        return jsonFormatted;
      } catch (e) {
        return value;
      }
    }

    return value;
  };

  return (
    <div
      className={cn('w-full h-full flex flex-col border rounded', className)}
    >
      <div className="flex w-full flex-none p-0">
        <div className={cn("flex justify-between items-center pl-2 pr-1 w-full border-b", isCollapsed ? 'border-b-0' : '')}>
          <div className="flex items-center gap-2">
            <Select
              value={mode}
              onValueChange={(value) => setMode(value)}
            >
              <SelectTrigger className="font-medium text-secondary-foreground bg-secondary text-xs border-gray-600 h-5">
                <SelectValue placeholder="Select tag type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="TEXT" value="text">
                  TEXT
                </SelectItem>
                <SelectItem key="YAML" value="yaml">
                  YAML
                </SelectItem>
                <SelectItem key="JSON" value="json">
                  JSON
                </SelectItem>
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
            <CopyToClipboardButton
              className='h-7 w-7'
              text={renderText(value)}
            >
              <Copy className="h-3.5 w-3.5" />
            </CopyToClipboardButton>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Maximize className="h-3.5 w-3.5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="flex flex-col gap-0 min-w-[50vw]">
                <DialogTitle className='hidden'></DialogTitle>
                <div className="flex-none border-b items-center flex px-4 justify-between">
                  <div className="flex justify-start">
                    <Select
                      value={mode}
                      onValueChange={(value) => setMode(value)}
                    >
                      <SelectTrigger className="font-medium text-secondary-foreground bg-secondary text-xs border-gray-600 h-6">
                        <SelectValue placeholder="Select tag type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem key="TEXT" value="text">
                          TEXT
                        </SelectItem>
                        <SelectItem key="YAML" value="yaml">
                          YAML
                        </SelectItem>
                        <SelectItem key="JSON" value="json">
                          JSON
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1">
                    <CopyToClipboardButton
                      className='h-7 w-7'
                      text={renderText(value)}
                    >
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
                  <div className="flex flex-col">
                    <CodeEditor
                      value={renderText(expandedValue)}
                      editable={editable}
                      language={mode}
                      onChange={(v) => {
                        setExpandedValue(v);
                        if (mode === 'yaml') {
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
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
      {(!collapsible || !isCollapsed) && (
        <div className="overflow-auto flex-1 flex bg-card">
          <CodeEditor
            value={renderText(value)}
            editable={editable}
            language={mode}
            onChange={(v) => {
              setExpandedValue(v);
              if (mode === 'yaml') {
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
        </div>
      )}
    </div>
  );
}
