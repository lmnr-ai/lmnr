"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";

interface SpanRow {
  span_id: string;
  name: string;
  span_type: string;
  start_time: string;
  end_time: string;
  status: string;
}

const ROW_HEIGHT = 6;
const MAX_ROWS = 8;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function MiniTimeline({ traceId }: { traceId: string }) {
  const { projectId } = useParams();
  const [spans, setSpans] = useState<SpanRow[]>([]);

  useEffect(() => {
    if (!UUID_REGEX.test(traceId)) return;

    const fetchSpans = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/sql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `SELECT span_id, name, span_type, start_time, end_time, status FROM spans WHERE trace_id = '${traceId}' ORDER BY start_time ASC LIMIT 50`,
            projectId,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setSpans(data);
        }
      } catch {
        // silently fail
      }
    };
    fetchSpans();
  }, [projectId, traceId]);

  const bars = useMemo(() => {
    if (spans.length === 0) return [];

    const startTimes = spans.map((s) => new Date(s.start_time).getTime());
    const endTimes = spans.map((s) => new Date(s.end_time).getTime());
    const minStart = Math.min(...startTimes);
    const maxEnd = Math.max(...endTimes);
    const totalDuration = maxEnd - minStart || 1;

    // Greedy lane assignment: assign each span to the first lane where it doesn't overlap
    const laneEnds: number[] = new Array(MAX_ROWS).fill(0);

    return spans.slice(0, MAX_ROWS * 4).map((span) => {
      const start = new Date(span.start_time).getTime();
      const end = new Date(span.end_time).getTime();
      const left = ((start - minStart) / totalDuration) * 100;
      const width = Math.max(((end - start) / totalDuration) * 100, 0.5);

      // Find the first lane where this span doesn't overlap
      let row = 0;
      for (let lane = 0; lane < MAX_ROWS; lane++) {
        if (start >= laneEnds[lane]) {
          row = lane;
          break;
        }
        if (lane === MAX_ROWS - 1) {
          // All lanes occupied, find the one that ends soonest
          row = laneEnds.indexOf(Math.min(...laneEnds));
        }
      }
      laneEnds[row] = end;

      const colorMap = SPAN_TYPE_TO_COLOR as Record<string, string>;
      const color =
        span.status === "error" ? "rgba(204, 51, 51, 1)" : (colorMap[span.span_type] ?? "hsl(var(--muted-foreground))");

      return { id: span.span_id, left, width, row, color, name: span.name };
    });
  }, [spans]);

  if (bars.length === 0) return null;

  const totalHeight = MAX_ROWS * ROW_HEIGHT;

  return (
    <div className="relative w-full bg-muted/30 rounded overflow-hidden" style={{ height: totalHeight }}>
      {bars.map((bar) => (
        <div
          key={bar.id}
          className="absolute rounded-xs"
          style={{
            left: `${bar.left}%`,
            width: `max(${bar.width}%, 3px)`,
            top: bar.row * ROW_HEIGHT + 1,
            height: ROW_HEIGHT - 2,
            backgroundColor: bar.color,
          }}
          title={bar.name}
        />
      ))}
    </div>
  );
}
