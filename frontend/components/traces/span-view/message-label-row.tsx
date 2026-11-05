import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface MessageLabel {
  beforeIndex: number;
  text: string;
  subtext?: string;
  /** Renders the label as a disclosure toggle. */
  onToggle?: () => void;
  open?: boolean;
}

const MessageLabelRow = ({ text, subtext, onToggle, open }: Omit<MessageLabel, "beforeIndex">) => {
  if (onToggle) {
    return (
      <Button variant="ghost" size="sm" className="gap-1 px-1 text-muted-foreground" onClick={onToggle}>
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {text}
      </Button>
    );
  }
  return (
    <span className="text-base font-medium text-secondary-foreground">
      {text}
      {subtext && <span className="text-sm text-muted-foreground ml-1">{subtext}</span>}
    </span>
  );
};

export default MessageLabelRow;
