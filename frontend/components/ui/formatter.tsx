import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './select';
import { useState } from 'react';
import YAML from 'yaml';
import { cn } from '@/lib/utils';
import CodeEditor from './code-editor';
import { Sheet, SheetClose, SheetContent, SheetTrigger } from './sheet';
import { Button } from './button';
import { Expand, Maximize, Minimize, X } from 'lucide-react';
import { ScrollArea } from './scroll-area';
import { DialogTitle } from './dialog';

interface OutputFormatterProps {
  value: string;
  className?: string;
  defaultMode?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
}

export default function Formatter({
  value,
  defaultMode = 'text',
  editable = false,
  onChange,
  className
}: OutputFormatterProps) {
  const [mode, setMode] = useState(defaultMode);
  const [expandedValue, setExpandedValue] = useState(value);

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
      <div className="flex w-full flex-none">
        <div className="flex justify-between items-center p-2 w-full border-b">
          <div>
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
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Maximize className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex flex-col gap-0 min-w-[50vw]">
              <DialogTitle className='hidden'></DialogTitle>
              <div className="flex-none border-b h-12 items-center flex p-4 justify-between">
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
                <SheetClose asChild>
                  <Button variant="ghost" size="icon">
                    <Minimize className="h-4 w-4" />
                  </Button>
                </SheetClose>
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
      <div className="overflow-auto flex-grow">
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
    </div>
  );
}
