import { Check, Link } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

/** Copies a link to one message; shown on the card's header while hovered. */
const MessageLinkButton = ({ onCopy }: { onCopy: () => Promise<void> }) => {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await onCopy();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: "destructive", title: "Failed to copy link" });
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Copy link to message"
      onClick={handleClick}
      className={cn(
        "ml-auto text-muted-foreground opacity-0 group-hover/span-message:opacity-100 focus-visible:opacity-100",
        copied && "opacity-100"
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Link className="size-3.5" />}
    </Button>
  );
};

export default MessageLinkButton;
