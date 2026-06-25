import {
  Activity,
  ArrowRight,
  Bolt,
  Braces,
  CircleAlert,
  DatabaseZap,
  FlagTriangleRight,
  Gauge,
  type LucideIcon,
  MessageCircle,
  PersonStanding,
} from "lucide-react";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { getSharedTrace } from "@/lib/actions/shared/trace";
import { loadOgFonts, OgContainer, OgHeader } from "@/lib/og/og-layout";
import { SpanType } from "@/lib/traces/types";

export const runtime = "nodejs";

// Mirrors SPAN_TYPE_TO_COLOR (lib/traces/utils) with the CSS-var entries resolved
// to hex/rgba — satori can't read CSS custom properties.
const SPAN_TYPE_COLOR: Record<string, string> = {
  [SpanType.DEFAULT]: "rgba(96, 165, 250, 0.7)",
  [SpanType.LLM]: "#7C3BED", // --llm
  [SpanType.EXECUTOR]: "rgba(245, 158, 11, 0.7)",
  [SpanType.EVALUATOR]: "rgba(7, 189, 213, 0.7)", // --subagent
  [SpanType.EVALUATION]: "rgba(16, 185, 129, 0.7)",
  [SpanType.HUMAN_EVALUATOR]: "rgba(244, 114, 182, 0.7)",
  [SpanType.TOOL]: "rgba(227, 160, 8, 0.9)",
  [SpanType.EVENT]: "rgba(204, 51, 51, 0.7)",
  [SpanType.CACHED]: "#7C3BED",
};

// Mirrors createSpanTypeIcon (components/traces/span-type-icon).
const SPAN_TYPE_ICON: Record<string, LucideIcon> = {
  [SpanType.DEFAULT]: Braces,
  [SpanType.LLM]: MessageCircle,
  [SpanType.CACHED]: DatabaseZap,
  [SpanType.EXECUTOR]: Activity,
  [SpanType.EVALUATOR]: ArrowRight,
  [SpanType.EVALUATION]: Gauge,
  [SpanType.TOOL]: Bolt,
  [SpanType.EVENT]: FlagTriangleRight,
  [SpanType.HUMAN_EVALUATOR]: PersonStanding,
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ traceId: string }> }) {
  const { traceId } = await params;

  let status = "unknown";
  let rootSpanName = "";
  let rootSpanType: SpanType | null = null;
  let totalTokens = 0;
  let totalCost = 0;
  let startTime = "";
  let duration = "";

  try {
    const trace = await getSharedTrace({ traceId });
    if (trace && trace.visibility === "public") {
      status = trace.status;
      rootSpanName = trace.topSpanName ?? "";
      rootSpanType = trace.topSpanType ?? null;
      totalTokens = trace.totalTokens;
      totalCost = trace.totalCost;
      startTime = new Date(trace.startTime).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const durationMs = new Date(trace.endTime).getTime() - new Date(trace.startTime).getTime();
      if (durationMs < 1000) {
        duration = `${durationMs}ms`;
      } else if (durationMs < 60000) {
        duration = `${(durationMs / 1000).toFixed(1)}s`;
      } else {
        duration = `${(durationMs / 60000).toFixed(1)}m`;
      }
    }
  } catch {
    // Use defaults
  }

  // success-bright (#36D399) / destructive-bright (#E25050) from globals.css tokens.
  // "unknown" is the default when the trace fails to load / isn't public — no
  // data to color, so leave the accent transparent rather than implying success.
  const accentColor = status === "error" ? "#E25050" : status === "unknown" ? "transparent" : "#36D399";

  // Span-type icon (mirrors the traces table): on error a red alert badge,
  // otherwise the type-colored square with the matching lucide glyph.
  const isError = status === "error";
  const Icon = isError ? CircleAlert : (rootSpanType && SPAN_TYPE_ICON[rootSpanType]) || Braces;
  const iconBgColor = isError
    ? "rgba(204, 51, 51, 1)"
    : (rootSpanType && SPAN_TYPE_COLOR[rootSpanType]) || SPAN_TYPE_COLOR[SpanType.DEFAULT];

  let fonts: Awaited<ReturnType<typeof loadOgFonts>> = [];
  try {
    fonts = await loadOgFonts();
  } catch {
    // Fall back to system fonts if Google Fonts is unreachable
  }

  return new ImageResponse(
    <OgContainer accentColor={accentColor}>
      <OgHeader label="Shared trace" />

      {/* Bottom-anchored content (pushed down by OgContainer's space-between) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        {/* Date */}
        {startTime && <span style={{ color: "#B5B5B5", fontSize: "40px", fontWeight: 500 }}>{startTime}</span>}

        {/* Root span name with span-type icon (foreground #E8E3E3 from globals.css) */}
        {rootSpanName && (
          <div style={{ display: "flex", alignItems: "center", gap: "24px", marginBottom: "24px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "72px",
                height: "72px",
                borderRadius: "12px",
                backgroundColor: iconBgColor,
              }}
            >
              <Icon color="#ffffff" size={44} strokeWidth={2} />
            </div>
            <span
              style={{
                color: "#E8E3E3",
                fontSize: "61px",
                fontWeight: 400,
                maxWidth: "920px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {rootSpanName}
            </span>
          </div>
        )}

        {/* Divider (border #2B2B31), full content width within the padding */}
        <div style={{ height: "2px", backgroundColor: "#2B2B31" }} />

        {/* Metrics, left-aligned */}
        <div style={{ display: "flex", gap: "80px" }}>
          {totalTokens > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ color: "#B5B5B5", fontSize: "30px", fontWeight: 500 }}>Tokens</span>
              <span style={{ color: "#ffffff", fontSize: "48px", fontWeight: 500 }}>
                {totalTokens.toLocaleString()}
              </span>
            </div>
          )}
          {totalCost > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ color: "#B5B5B5", fontSize: "30px", fontWeight: 500 }}>Cost</span>

              <span style={{ color: "#ffffff", fontSize: "48px", fontWeight: 500 }}>
                ${totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(2)}
              </span>
            </div>
          )}
          {duration && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ color: "#B5B5B5", fontSize: "30px", fontWeight: 500 }}>Duration</span>
              <span style={{ color: "#ffffff", fontSize: "48px", fontWeight: 500 }}>{duration}</span>
            </div>
          )}
        </div>
      </div>
    </OgContainer>,
    {
      width: 1200,
      height: 630,
      fonts,
    }
  );
}
