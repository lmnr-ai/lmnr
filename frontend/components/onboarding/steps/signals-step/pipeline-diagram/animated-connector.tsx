import {
  BIT_FREQUENCY,
  BIT_TRAVEL,
  type ConnectorTiming,
  stageProgress,
} from "@/components/onboarding/steps/signals-step/pipeline-diagram/timeline";

interface AnimatedConnectorProps {
  time: number;
  timing: ConnectorTiming;
}

export default function AnimatedConnector({ time, timing }: AnimatedConnectorProps) {
  const drawn = stageProgress(time, timing.drawAt, timing.drawDuration);
  const emissionCount = Math.ceil((timing.emitEnd - timing.emitStart) * BIT_FREQUENCY);

  return (
    <div className="relative h-0.5 w-15 min-w-6 shrink">
      <div className="absolute inset-0 origin-left bg-surface-400" style={{ transform: `scaleX(${drawn})` }} />
      {Array.from({ length: emissionCount }).map((_, i) => {
        const elapsed = time - (timing.emitStart + i / BIT_FREQUENCY);
        if (elapsed < 0 || elapsed >= BIT_TRAVEL) return null;
        const position = elapsed / BIT_TRAVEL;
        return (
          <div
            key={i}
            className="absolute top-0 h-0.5 w-3 rounded-full bg-foreground-400"
            style={{ left: `calc(${position * 100}% - ${position * 0.75}rem)` }}
          />
        );
      })}
    </div>
  );
}
