import { motion } from "framer-motion";
import { ArrowUp, StopCircleIcon, X } from "lucide-react";
import { KeyboardEvent, memo, MouseEvent, useEffect, useMemo, useRef, useState } from "react";

import ModelSelect from "@/components/chat/model-select";
import { usePricingContext } from "@/components/chat/pricing-context";
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
  const [isHidden, setIsHidden] = useState(true);
  const { handleOpen, user } = usePricingContext();

  const isPro = useMemo(() => user?.userSubscriptionTier.trim().toLowerCase() !== "free", [user]);

  const handleClose = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsHidden(true);
    localStorage.setItem("chat:modal-banner", "hidden");
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const value = localStorage.getItem("chat:modal-banner");
      setIsHidden(value === "hidden");
    }
  }, []);

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
    <div className="relative w-full gap-4">
      <div className={cn("peer relative rounded-t-xl bg-zinc-700", { hidden: isHidden || isPro })}>
        <div className="banner flex items-center justify-between pl-3 pr-2 text-sm">
          <span className="text-secondary-foreground">Get unlimited messages with Pro.</span>
          <div className="flex items-center gap-1">
            <Button
              onClick={(e) => {
                e.preventDefault();
                handleOpen(true);
              }}
              variant="ghost"
              className="text-primary hover:text-primary hover:underline px-0"
            >
              Upgrade to Pro
            </Button>
            <Button onClick={handleClose} className="p-1 text-secondary-foreground" variant="ghost">
              <X size={12} className="size-3" />
            </Button>
          </div>
        </div>
      </div>
      <div
        className={cn("rounded-b-xl", {
          "bg-zinc-700": !isHidden && !isPro,
        })}
      >
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
      </div>
      <motion.div
        className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        {isLoading ? <StopButton stop={stop} /> : <SendButton input={value} />}
      </motion.div>

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
