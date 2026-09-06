import { cn } from "@/lib/utils";

/** Line box the product collapses these to: `(lineHeight + 4) * maxLines`, at
 *  the 17px line height and 4-line cap the transcript passes. */
const COLLAPSED_MAX_H = (17 + 4) * 4;

// A span's output. No Streamdown and no "... more" toggle: every preview in
// ../../demo-trace is one plain sentence, two lines at this width. The cap
// stays as the backstop — a longer one clips rather than shoving its neighbours
// down the panel.
const PreviewText = ({ text, className }: { text: string; className?: string }) => (
  <div className={cn("text-[13px] text-secondary-foreground/95 break-words", className)}>
    <div className="overflow-hidden" style={{ maxHeight: COLLAPSED_MAX_H }}>
      <p className="text-[13px]">{text}</p>
    </div>
  </div>
);

export default PreviewText;
