"use client";

import { useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { DEBUGGER_PROMPT, DEBUGGER_SEQUENCE } from "./debugger-sequence";
import DebuggerTerminalMock from "./debugger-terminal-mock";
import { frameAtElapsed, timelineDuration } from "./debugger-timeline";
import type { TransferProgress } from "./debugger-types";

const TIMELINE_DURATION = timelineDuration(DEBUGGER_PROMPT, DEBUGGER_SEQUENCE);
const emptySubscribe = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

interface Props {
  onTransferProgressChange?: (progress: TransferProgress | undefined) => void;
}

const DebuggerScene = ({ onTransferProgressChange }: Props) => {
  const sceneRef = useRef<HTMLDivElement>(null);
  const animationFrame = useRef<number>(undefined);
  const isInView = useInView(sceneRef, { once: true, amount: 0.3 });
  const reduceMotion = useReducedMotion();
  const [elapsedMs, setElapsedMs] = useState(0);
  const isMounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!isInView || reduceMotion) return;
    const startedAt = performance.now();

    const update = (now: number) => {
      const elapsed = Math.min(now - startedAt, TIMELINE_DURATION);
      setElapsedMs(elapsed);
      if (elapsed < TIMELINE_DURATION) animationFrame.current = requestAnimationFrame(update);
    };

    animationFrame.current = requestAnimationFrame(update);
    return () => {
      if (animationFrame.current !== undefined) cancelAnimationFrame(animationFrame.current);
    };
  }, [isInView, reduceMotion]);

  const frame = frameAtElapsed(
    DEBUGGER_PROMPT,
    DEBUGGER_SEQUENCE,
    isMounted && reduceMotion ? TIMELINE_DURATION : elapsedMs
  );
  const pipeProgress = frame.transfer?.pipe;
  const progressBarProgress = frame.transfer?.progressBar;

  useEffect(() => {
    onTransferProgressChange?.(
      pipeProgress === undefined ? undefined : { pipe: pipeProgress, progressBar: progressBarProgress }
    );
  }, [onTransferProgressChange, pipeProgress, progressBarProgress]);

  const entries = DEBUGGER_SEQUENCE.slice(0, frame.revealed).map((step) => step.entry);
  const pendingEntry = DEBUGGER_SEQUENCE[frame.revealed]?.entry;
  if (pendingEntry?.kind === "result" && pendingEntry.transferTotal && progressBarProgress !== undefined) {
    entries.push({
      kind: "progress",
      current: Math.max(
        1,
        Math.min(pendingEntry.transferTotal, Math.ceil(progressBarProgress * pendingEntry.transferTotal))
      ),
      label: pendingEntry.transferLabel ?? "spans",
      total: pendingEntry.transferTotal,
    });
  }

  return (
    <div ref={sceneRef} className="flex w-full justify-start px-8 py-12 md:py-[72px]">
      <div className="flex w-full min-w-min items-center justify-center">
        <DebuggerTerminalMock
          entries={entries}
          typed={frame.typed}
          isTyping={frame.isTyping}
          finished={frame.revealed >= DEBUGGER_SEQUENCE.length}
          prompt={DEBUGGER_PROMPT}
        />
      </div>
    </div>
  );
};

export default DebuggerScene;
