"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// 2D drag canvas for a curve: X = interpolation param t, Y = OKLCH lightness (top = light).

import { useCallback, useRef, useState } from "react";

import { useStyleContext } from "./style-context";
import { clamp, computeSurfaceColor, type CurveKey } from "./tokens";

export default function CurveEditor({ curve }: { curve: CurveKey }) {
  const { state, setPoint } = useStyleContext();
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const { points, endpoints } = state[curve];

  const updateFromEvent = useCallback(
    (key: string, clientX: number, clientY: number) => {
      const box = boxRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      const t = clamp((clientX - rect.left) / rect.width, 0, 1);
      const l = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
      setPoint(curve, key, t, l);
    },
    [curve, setPoint]
  );

  const onPointerDown = (key: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(key);
    updateFromEvent(key, e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    updateFromEvent(dragging, e.clientX, e.clientY);
  };

  const stopDrag = () => setDragging(null);

  // Polyline path sorted by t for visual continuity.
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const polyline = sorted.map((p) => `${p.t * 100},${(1 - p.l) * 100}`).join(" ");

  return (
    <div
      ref={boxRef}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      className="relative h-48 w-full overflow-hidden rounded-md border border-border bg-surface-1000 select-none"
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth={0.5} className="text-border" />
      </svg>
      {points.map((p) => (
        <button
          key={p.key}
          type="button"
          aria-label={p.key}
          onPointerDown={onPointerDown(p.key)}
          style={{
            left: `${p.t * 100}%`,
            top: `${(1 - p.l) * 100}%`,
            backgroundColor: computeSurfaceColor(p, endpoints),
          }}
          className="absolute size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-white/60 shadow active:cursor-grabbing"
        />
      ))}
    </div>
  );
}
