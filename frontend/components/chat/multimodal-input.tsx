import { Send, StopCircleIcon } from "lucide-react";
import { KeyboardEvent,memo } from "react";

import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import { cn } from "@/lib/utils";
interface MultimodalInputProps {
  isLoading: boolean;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  stop: () => void;
  onSubmit: () => void;
  model: string;
  onModelChange: (model: string) => void;
}

const MultimodalInput = ({ isLoading, value, onChange, className, stop, onSubmit, model, onModelChange }: MultimodalInputProps) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading) {
        onSubmit();
      }
    }
  };

  return (
    <div className="relative w-full flex flex-col gap-4">
      <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
        {isLoading ? <StopButton stop={stop} /> : <SendButton input={value} submitForm={() => {}} />}
      </div>
      <DefaultTextarea
        placeholder="Send a message..."
        value={value}
        onKeyDown={handleKeyDown}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "min-h-24 max-h-[calc(75dvh)] overflow-hidden rounded-2xl px-3 !text-base bg-muted pb-10 border border-zinc-700",
          className
        )}
        autoFocus
        disabled={isLoading}
      />
      <div className="absolute bottom-0 left-0 p-2 w-fit flex flex-row justify-end">
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger className="w-fit border-none">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="claude-3-7-sonnet-latest">
                  claude-3-7-sonnet-latest
            </SelectItem>
            <SelectItem value="claude-3-7-sonnet-20250219">
                  claude-3-7-sonnet-20250219
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default MultimodalInput;

function PureStopButton({ stop }: { stop: () => void }) {
  return (
    <Button
      data-testid="stop-button"
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        stop();
      }}
    >
      <StopCircleIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);

function PureSendButton({ submitForm, input }: { submitForm: () => void; input: string }) {
  return (
    <Button className="rounded-full p-2 h-fit border" type="submit" disabled={input.length === 0}>
      <Send size={14} />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => prevProps.input === nextProps.input);
