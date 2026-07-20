"use client";

import * as React from "react";
import * as ResizablePrimitive from "react-resizable-panels";

import { GripVerticalIcon } from "@/components/ui/icon-lib";
import { cn } from "@/lib/utils";

function ResizablePanelGroup({ className, ...props }: React.ComponentProps<typeof ResizablePrimitive.Group>) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn("flex h-full w-full aria-[orientation=vertical]:flex-col", className)}
      {...props}
    />
  );
}

function ResizablePanel({ ...props }: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  onDragChange,
  onPointerDown,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
  // Fires true on drag-start, false on drag-end. react-resizable-panels v4
  // dropped its onDragging callback, so we re-derive it from pointer events:
  // press starts the drag, the next window pointerup/cancel ends it.
  onDragChange?: (dragging: boolean) => void;
}) {
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const pointerId = e.pointerId;
    onDragChange!(true);
    const end = (ev: PointerEvent) => {
      // Only this drag's own pointer ends it — a second (touch) pointer releasing
      // elsewhere must not clear the flag mid-drag.
      if (ev.pointerId !== pointerId) return;
      onDragChange!(false);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    onPointerDown?.(e);
  };
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      onPointerDown={onDragChange ? handlePointerDown : onPointerDown}
      className={cn(
        "relative flex items-center justify-center bg-border",
        "focus-visible:ring-0 focus-visible:outline-none",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
        "aria-[orientation=vertical]:h-auto aria-[orientation=vertical]:w-px",
        "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full",
        "aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
        "[&[aria-orientation=horizontal]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
