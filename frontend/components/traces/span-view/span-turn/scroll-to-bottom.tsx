import { ChevronDown } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

// Within this of the end, the output is already in view.
const NEAR_BOTTOM = 200;

interface ScrollToBottomProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  onClick: () => void;
}

/** Floats over the list's bottom-right corner while the end of the list is out of view. */
const ScrollToBottom = ({ scrollRef, onClick }: ScrollToBottomProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setVisible(el.scrollHeight - el.scrollTop - el.clientHeight > NEAR_BOTTOM);
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [scrollRef]);

  if (!visible) return null;
  return (
    <Button
      aria-label="Scroll to bottom"
      size="icon"
      className="absolute bottom-3 right-5 z-40 rounded-full animate-in fade-in"
      onClick={onClick}
    >
      <ChevronDown className="size-4" />
    </Button>
  );
};

export default ScrollToBottom;
