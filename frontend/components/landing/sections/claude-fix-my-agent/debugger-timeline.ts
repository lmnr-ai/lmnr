import type { Step, TransferProgress } from "./debugger-types";

export const TYPE_DURATION_MS = 22;
export const INTERVAL_BETWEEN_LINES_MS = 200;
export const PIPE_DURATION_MS = 350;
export const PROGRESS_BAR_DURATION_MS = 1_900;

export interface DebuggerFrame {
  isTyping: boolean;
  revealed: number;
  transfer?: TransferProgress;
  typed: string;
}

const stepDuration = (step: Step) =>
  step.entry.kind === "result" && step.entry.transferTotal
    ? PIPE_DURATION_MS + PROGRESS_BAR_DURATION_MS
    : INTERVAL_BETWEEN_LINES_MS;

export const timelineDuration = (prompt: string, sequence: Step[]) =>
  prompt.length * TYPE_DURATION_MS + sequence.reduce((duration, step) => duration + stepDuration(step), 0);

export const frameAtElapsed = (prompt: string, sequence: Step[], elapsedMs: number): DebuggerFrame => {
  const typingDuration = prompt.length * TYPE_DURATION_MS;
  let elapsed = Math.max(0, elapsedMs);

  if (elapsed < typingDuration) {
    return {
      isTyping: true,
      revealed: 0,
      typed: prompt.slice(0, Math.floor(elapsed / TYPE_DURATION_MS)),
    };
  }

  elapsed -= typingDuration;
  let revealed = 0;
  while (revealed < sequence.length) {
    const duration = stepDuration(sequence[revealed]);
    if (elapsed < duration) break;
    elapsed -= duration;
    revealed += 1;
  }

  const pendingEntry = sequence[revealed]?.entry;
  let transfer: TransferProgress | undefined;
  if (pendingEntry?.kind === "result" && pendingEntry.transferTotal) {
    transfer = {
      pipe: Math.min(1, elapsed / PIPE_DURATION_MS),
      progressBar:
        elapsed >= PIPE_DURATION_MS ? Math.min(1, (elapsed - PIPE_DURATION_MS) / PROGRESS_BAR_DURATION_MS) : undefined,
    };
  }

  return { isTyping: false, revealed, transfer, typed: prompt };
};
