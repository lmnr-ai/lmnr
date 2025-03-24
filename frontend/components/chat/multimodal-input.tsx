import { motion } from "framer-motion";
import { ArrowUp, StopCircleIcon } from "lucide-react";
import { KeyboardEvent, memo, useEffect, useRef } from "react";

import ModelSelect from "@/components/chat/model-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface MultimodalInputProps {
  isLoading: boolean;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  stop: () => void;
  onSubmit: () => void;
  modelState: { model: string; enableThinking: boolean };
  onModelStateChange: ({ model, enableThinking }: { model: string; enableThinking: boolean }) => void;
}

const MultimodalInput = ({
  isLoading,
  value,
  onChange,
  className,
  stop,
  onSubmit,
  modelState,
  onModelStateChange,
}: MultimodalInputProps) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading) {
        onSubmit();
      }
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [value]);

  return (
    <div className="relative w-full flex flex-col gap-4">
      <motion.div
        className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        {isLoading ? <StopButton stop={stop} /> : <SendButton input={value} />}
      </motion.div>
      <Textarea
        ref={textareaRef}
        placeholder="Send a message..."
        value={value}
        onKeyDown={handleKeyDown}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "min-h-24 max-h-[calc(75dvh)] rounded-xl !text-base px-3 bg-muted pb-14 border border-zinc-700 resize-none focus-visible:ring-0",
          className
        )}
        disabled={isLoading}
      />
      <motion.div
        className="absolute bottom-0 left-0 p-2 w-fit flex flex-row justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <ModelSelect disabled={isLoading} modelState={modelState} onModelStateChange={onModelStateChange} />
      </motion.div>
    </div>
  );
};

export default MultimodalInput;

function PureStopButton({ stop }: { stop: () => void }) {
  return (
    <Button
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600 z-50"
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

function PureSendButton({ input }: { input: string }) {
  return (
    <Button className="rounded-full p-1 h-fit border" type="submit" disabled={input.length === 0}>
      <ArrowUp size={18} />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => prevProps.input === nextProps.input);
