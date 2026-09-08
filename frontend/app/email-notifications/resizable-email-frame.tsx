"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ResizableEmailFrameProps {
  html: string;
  /** Frame chrome color, follows the workspace light/dark toggle. */
  dark: boolean;
  initialWidth?: number;
  initialHeight?: number;
}

const MIN_WIDTH = 280;
const MIN_HEIGHT = 240;

type DragState = { axis: "x" | "y" | "xy"; startX: number; startY: number; startW: number; startH: number };

export default function ResizableEmailFrame({
  html,
  dark,
  initialWidth = 620,
  initialHeight = 720,
}: ResizableEmailFrameProps) {
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  const dragRef = useRef<DragState | null>(null);

  const startDrag = useCallback(
    (axis: DragState["axis"]) => (e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = {
        axis,
        startX: e.clientX,
        startY: e.clientY,
        startW: size.width,
        startH: size.height,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [size.width, size.height]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      // Handles sit on one edge but the frame is centered, so a drag moves both edges.
      const dx = (e.clientX - drag.startX) * 2;
      const dy = e.clientY - drag.startY;
      setSize({
        width: drag.axis === "y" ? drag.startW : Math.max(MIN_WIDTH, Math.round(drag.startW + dx)),
        height: drag.axis === "x" ? drag.startH : Math.max(MIN_HEIGHT, Math.round(drag.startH + dy)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const handleClass = dark ? "bg-white/15 hover:bg-white/35" : "bg-black/15 hover:bg-black/35";

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative rounded-lg border ${dark ? "border-white/10" : "border-black/10"}`}
        style={{ width: size.width, height: size.height }}
      >
        <iframe
          title="Email preview"
          srcDoc={html}
          sandbox="allow-same-origin"
          className="h-full w-full rounded-lg border-0 bg-transparent"
        />

        {/* right edge — width */}
        <div
          onPointerDown={startDrag("x")}
          className={`absolute -right-1 top-1/2 h-16 w-2 -translate-y-1/2 cursor-ew-resize rounded-full transition-colors ${handleClass}`}
        />
        {/* bottom edge — height */}
        <div
          onPointerDown={startDrag("y")}
          className={`absolute -bottom-1 left-1/2 h-2 w-16 -translate-x-1/2 cursor-ns-resize rounded-full transition-colors ${handleClass}`}
        />
        {/* corner — both */}
        <div
          onPointerDown={startDrag("xy")}
          className={`absolute -bottom-1 -right-1 size-3 cursor-nwse-resize rounded-full transition-colors ${handleClass}`}
        />
      </div>
      <span className={`font-mono text-[11px] tabular-nums ${dark ? "text-white/40" : "text-black/40"}`}>
        {size.width} × {size.height}
      </span>
    </div>
  );
}
