import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { getSharedTrace } from "@/lib/actions/shared/trace";
import { loadOgFonts, OgContainer, OgHeader } from "@/lib/og/og-layout";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ traceId: string }> }) {
  const { traceId } = await params;

  let status = "unknown";
  let traceType = "";
  let totalTokens = 0;
  let totalCost = 0;
  let startTime = "";
  let duration = "";

  try {
    const trace = await getSharedTrace({ traceId });
    if (trace && trace.visibility === "public") {
      status = trace.status;
      traceType = trace.traceType;
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

  const statusColor = status === "ok" ? "#22c55e" : status === "error" ? "#ef4444" : "#a3a3a3";

  let fonts: Awaited<ReturnType<typeof loadOgFonts>> = [];
  try {
    fonts = await loadOgFonts();
  } catch {
    // Fall back to system fonts if Google Fonts is unreachable
  }

  return new ImageResponse(
    (
      <OgContainer>
        <OgHeader label="Shared Trace" />

        {/* Center content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "32px", flex: 1, justifyContent: "center" }}>
          {/* Status and type */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "#1a1a1a",
                borderRadius: "9999px",
                padding: "8px 20px",
                border: `1px solid ${statusColor}40`,
              }}
            >
              <div
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: statusColor,
                }}
              />
              <span style={{ color: statusColor, fontSize: "18px", fontWeight: 600, textTransform: "uppercase" }}>
                {status}
              </span>
            </div>
            {traceType && (
              <span
                style={{
                  color: "#a3a3a3",
                  fontSize: "18px",
                  backgroundColor: "#1a1a1a",
                  borderRadius: "9999px",
                  padding: "8px 20px",
                  border: "1px solid #333333",
                }}
              >
                {traceType}
              </span>
            )}
          </div>

          {/* Metrics */}
          <div style={{ display: "flex", gap: "48px" }}>
            {totalTokens > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "#737373", fontSize: "16px", textTransform: "uppercase", letterSpacing: "1px" }}>
                  Tokens
                </span>
                <span style={{ color: "#ffffff", fontSize: "36px", fontWeight: 700 }}>
                  {totalTokens.toLocaleString()}
                </span>
              </div>
            )}
            {totalCost > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "#737373", fontSize: "16px", textTransform: "uppercase", letterSpacing: "1px" }}>
                  Cost
                </span>
                <span style={{ color: "#ffffff", fontSize: "36px", fontWeight: 700 }}>
                  ${totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(2)}
                </span>
              </div>
            )}
            {duration && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "#737373", fontSize: "16px", textTransform: "uppercase", letterSpacing: "1px" }}>
                  Duration
                </span>
                <span style={{ color: "#ffffff", fontSize: "36px", fontWeight: 700 }}>{duration}</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom section */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {startTime && <span style={{ color: "#737373", fontSize: "18px" }}>{startTime}</span>}
          <span style={{ color: "#525252", fontSize: "16px" }}>laminar.sh</span>
        </div>
      </OgContainer>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
    }
  );
}
