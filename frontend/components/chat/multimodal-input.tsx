import { Send, StopCircleIcon } from "lucide-react";
import { memo } from "react";

import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import { cn } from "@/lib/utils";
interface MultimodalInputProps {
  isLoading: boolean;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  stop: () => void;
}

const MultimodalInput = ({ isLoading, value, onChange, className, stop }: MultimodalInputProps) => (
  <div className="relative w-full flex flex-col gap-4">
    <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
      {isLoading ? <StopButton stop={stop} /> : <SendButton input={value} submitForm={() => {}} />}
    </div>
    <DefaultTextarea
      placeholder="Send a message..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "min-h-24 max-h-[calc(75dvh)] overflow-hidden rounded-2xl px-3 !text-base bg-muted pb-10 border border-zinc-700",
        className
      )}
      autoFocus
      disabled={isLoading}
    />
  </div>
);

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
