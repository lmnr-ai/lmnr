"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// OKLCH accent-family canvas (#9): X = hue (0..360), Y = lightness (top = light).
// - ONE cubic lightness-by-hue curve, its anchors draggable in 2D (square handles).
// - One vertical line per raw hue, draggable in HUE ONLY (left/right).
// - Each color is sampled where its line crosses the curve (L = curve(hue)); chroma = shared + nudge.
// The shaded band is the sRGB gamut ceiling for the shared chroma — lightness above it is unreachable.

import { useCallback, useRef, useState } from "react";

import { useStyleContext } from "./style-context";
import { catmullRom, clamp, maxLInGamut, oklchInGamut, oklchToSrgb } from "./tokens";

const HUE_MAX = 360;
const CEILING_STEP = 6;

type Drag = { kind: "anchor"; index: number } | { kind: "color"; key: string };

export default function AccentCurveEditor() {
  const { state, setAccentAnchor, addAccentAnchor, removeAccentAnchor, setAccentColor } = useStyleContext();
  const { chroma, curve, colors } = state.accent;
  const boxRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const posFromEvent = useCallback((clientX: number, clientY: number) => {
    const rect = boxRef.current!.getBoundingClientRect();
    return {
      hue: clamp((clientX - rect.left) / rect.width, 0, 1) * HUE_MAX,
      l: clamp(1 - (clientY - rect.top) / rect.height, 0, 1),
    };
  }, []);

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || !boxRef.current) return;
    const { hue, l } = posFromEvent(e.clientX, e.clientY);
    if (drag.kind === "anchor") setAccentAnchor(drag.index, { hue, l });
    else setAccentColor(drag.key, { hue }); // color lines move in hue only — L follows the curve
  };
  const start = (d: Drag) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(d);
  };
  const stop = () => setDrag(null);

  // Double-click empty canvas to add a curve anchor at that hue/lightness.
  const onDoubleClick = (e: React.PointerEvent | React.MouseEvent) => {
    if (!boxRef.current) return;
    const { hue, l } = posFromEvent(e.clientX, e.clientY);
    addAccentAnchor({ hue, l });
  };

  const curvePts = curve.map((p) => ({ x: p.hue, y: p.l }));
  const curveSorted = [...curve].sort((a, b) => a.hue - b.hue);
  // Smooth curve as a dense polyline sampled off Catmull-Rom.
  const line: string[] = [];
  for (let h = 0; h <= HUE_MAX; h += 3) line.push(`${(h / HUE_MAX) * 100},${(1 - catmullRom(curvePts, h)) * 100}`);

  const ceiling: string[] = [];
  for (let h = 0; h <= HUE_MAX; h += CEILING_STEP) ceiling.push(`${(h / HUE_MAX) * 100},${(1 - maxLInGamut(chroma, h)) * 100}`);
  const ceilingArea = `0,0 ${ceiling.join(" ")} 100,0`;

  return (
    <div
      ref={boxRef}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onDoubleClick={onDoubleClick}
      className="relative h-56 w-full overflow-hidden rounded-md border border-border bg-surface-100 select-none"
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points={ceilingArea} className="fill-destructive/15" />
        <polyline points={ceiling.join(" ")} fill="none" stroke="currentColor" strokeWidth={0.4} className="text-destructive/50" />
        <polyline points={line.join(" ")} fill="none" stroke="currentColor" strokeWidth={0.6} className="text-foreground-300" />
      </svg>

      {/* color vertical lines — hue only; dot at the curve intersection */}
      {colors.map((c) => {
        const l = catmullRom(curvePts, c.hue);
        const cc = Math.max(0, chroma + c.nudge);
        const [r, g, b] = oklchToSrgb(l, cc, c.hue);
        const clipped = !oklchInGamut(l, cc, c.hue);
        const leftPct = (c.hue / HUE_MAX) * 100;
        return (
          <div key={c.key}>
            <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-foreground-600/50" style={{ left: `${leftPct}%` }} />
            <button
              type="button"
              aria-label={c.key.replace(/^--/, "")}
              title={`${c.key.replace(/^--/, "")} · hue ${Math.round(c.hue)}°${clipped ? " · out of gamut" : ""}`}
              onPointerDown={start({ kind: "color", key: c.key })}
              style={{ left: `${leftPct}%`, top: `${(1 - l) * 100}%`, backgroundColor: `rgb(${r} ${g} ${b})` }}
              className={
                "absolute size-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full shadow " +
                (clipped ? "ring-2 ring-destructive" : "ring-1 ring-white/70")
              }
            />
          </div>
        );
      })}

      {/* curve anchors — draggable in 2D (square handles) */}
      {curveSorted.map((p) => {
        const index = curve.indexOf(p);
        return (
          <button
            key={index}
            type="button"
            aria-label={`curve anchor ${index + 1}`}
            title="Drag to shape · double-click to remove"
            onPointerDown={start({ kind: "anchor", index })}
            onDoubleClick={(e) => {
              e.stopPropagation(); // don't also add a point on the canvas
              removeAccentAnchor(index);
            }}
            style={{ left: `${(p.hue / HUE_MAX) * 100}%`, top: `${(1 - p.l) * 100}%` }}
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-[2px] border border-white/70 bg-foreground-200 active:cursor-grabbing"
          />
        );
      })}
    </div>
  );
}
