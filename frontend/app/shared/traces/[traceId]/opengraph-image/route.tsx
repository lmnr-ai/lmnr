import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { getSharedTrace } from "@/lib/actions/shared/trace";

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

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0a0a0a",
          padding: "60px 80px",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Top section */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <svg width="36" height="36" viewBox="0 0 76 76" fill="none">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M1.32507 73.4886C0.00220402 72.0863 0.0802819 69.9867 0.653968 68.1462C3.57273 58.7824 5.14534 48.8249 5.14534 38.5C5.14534 27.8899 3.48464 17.6677 0.408998 8.0791C-0.129499 6.40029 -0.266346 4.50696 0.811824 3.11199C2.27491 1.21902 4.56777 0 7.14535 0H37.1454C58.1322 0 75.1454 17.0132 75.1454 38C75.1454 58.9868 58.1322 76 37.1454 76H7.14535C4.85185 76 2.78376 75.0349 1.32507 73.4886Z"
                fill="white"
              />
            </svg>
            <span style={{ color: "#ffffff", fontSize: "28px", fontWeight: 600 }}>laminar</span>
          </div>
          <span
            style={{
              color: "#a3a3a3",
              fontSize: "18px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "2px",
            }}
          >
            Shared Trace
          </span>
        </div>

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

        {/* Accent line */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7)",
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
