import { cn } from "@/lib/utils";

/** Line box the product collapses these to: `(lineHeight + 4) * maxLines`, at
 *  the 17px line height and 4-line cap the transcript passes. */
const COLLAPSED_MAX_H = (17 + 4) * 4;

// A span's output, under an LLM row or under the run's input.
//
// The product renders this through `CollapsedTextWithMore`, which runs the text
// through Streamdown and grows a "... more" toggle once it overflows the four
// lines above. Neither applies here: every preview in ../../demo-trace is one
// plain sentence, two lines at this width, so there is no markdown to parse and
// the toggle can never appear. The cap stays as the backstop — a longer preview
// clips rather than pushing the row's neighbours down the panel.
const PreviewText = ({ text, className }: { text: string; className?: string }) => (
  <div className={cn("text-[13px] text-secondary-foreground/95 break-words", className)}>
    <div className="overflow-hidden" style={{ maxHeight: COLLAPSED_MAX_H }}>
      <p className="text-[13px]">{text}</p>
    </div>
  </div>
);

export default PreviewText;
