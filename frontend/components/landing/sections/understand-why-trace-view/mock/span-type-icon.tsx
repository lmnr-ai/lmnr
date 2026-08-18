import { Bolt, Braces, CircleAlert, MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";

import { type MockSpan, type MockSpanType } from "../../demo-trace";

/** `SPAN_TYPE_TO_COLOR`, trimmed to the three types this trace has. Copied
 *  rather than imported: the point of ./ is that the landing page cannot be
 *  restyled by a change to the product's palette. */
export const SPAN_COLOR: Record<MockSpanType, string> = {
  DEFAULT: "rgba(96, 165, 250, 0.7)",
  LLM: "hsl(var(--llm))",
  TOOL: "rgba(227, 160, 8, 0.9)",
};

/** An errored span takes red whatever its type. */
export const SPAN_ERROR_COLOR = "rgba(204, 51, 51, 1)";

const GLYPH = { DEFAULT: Braces, LLM: MessageCircle, TOOL: Bolt };

/** The colour a span's bar and icon are drawn in. */
export const spanColor = (span: Pick<MockSpan, "spanType" | "status">) =>
  span.status === "error" ? SPAN_ERROR_COLOR : SPAN_COLOR[span.spanType];

interface Props {
  span: Pick<MockSpan, "spanType" | "status">;
  /** The glyph's own size, in px. The BOX around it is `boxSize`. */
  size?: number;
  boxSize?: number;
  className?: string;
}

const SpanTypeIcon = ({ span, size = 14, boxSize = 20, className }: Props) => {
  const Glyph = span.status === "error" ? CircleAlert : GLYPH[span.spanType];
  return (
    <div
      className={cn("flex items-center justify-center z-10 rounded", className)}
      style={{
        backgroundColor: spanColor(span),
        minWidth: boxSize,
        minHeight: boxSize,
        width: boxSize,
        height: boxSize,
      }}
    >
      {/* The error glyph is the only one drawn at `size`. Every other type goes
          through the product's icon factory, whose `w-4 h-4` default overrides
          the same `size` — so an errored span's mark is 14px and the rest are
          16px, inside the same 20px box. */}
      <Glyph className={span.status === "error" ? undefined : "w-4 h-4"} size={size} />
    </div>
  );
};

export default SpanTypeIcon;
