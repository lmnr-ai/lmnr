import { useId } from "react";

interface Props {
  /** Draws the road dashed (dash = gap, in px) and carries no bits. */
  dashLength?: number;
  ambientStart?: number;
  ambientTravelDuration?: number;
  bitFrequency: number;
  bitLength: number;
  className: string;
  d: string;
  emissionEnd: number;
  emissionStart: number;
  pathLength: number;
  pathProgress: number;
  time: number;
  travelDuration: number;
  viewBox: string;
}

const AnimatedConnection = ({
  dashLength,
  ambientStart,
  ambientTravelDuration,
  bitFrequency,
  bitLength,
  className,
  d,
  emissionEnd,
  emissionStart,
  pathLength,
  pathProgress,
  time,
  travelDuration,
  viewBox,
}: Props) => {
  const maskId = useId();
  const interval = 1 / bitFrequency;
  const emissionCount = Math.max(0, Math.ceil((emissionEnd - emissionStart) / interval));
  const normalizedLength = Math.min(bitLength / pathLength, 0.95);
  const bits = Array.from({ length: emissionCount }, (_, index) => ({
    key: `burst-${index}`,
    elapsed: time - (emissionStart + index * interval),
    travel: travelDuration,
  }));
  // After `ambientStart` the road keeps emitting forever (the settled state); only
  // emissions still on the path are rendered.
  if (dashLength === undefined && ambientStart !== undefined && time >= ambientStart) {
    const travel = ambientTravelDuration ?? travelDuration;
    const first = Math.max(0, Math.ceil((time - ambientStart - travel) / interval));
    const last = Math.floor((time - ambientStart) / interval);
    for (let index = first; index <= last; index++) {
      bits.push({ key: `ambient-${index}`, elapsed: time - (ambientStart + index * interval), travel });
    }
  }

  if (dashLength !== undefined) {
    // pathLength-normalised dashes can't be in px, so a solid reveal stroke masks a px-dashed path.
    return (
      <svg aria-hidden="true" className={className} viewBox={viewBox} fill="none" preserveAspectRatio="none">
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <path
            d={d}
            pathLength="1"
            stroke="white"
            strokeWidth="3"
            strokeDasharray="1"
            strokeDashoffset={1 - pathProgress}
          />
        </mask>
        <path
          d={d}
          className="stroke-foreground-600"
          strokeWidth="1"
          strokeDasharray={`${dashLength} ${dashLength}`}
          mask={`url(#${maskId})`}
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={className} viewBox={viewBox} fill="none" preserveAspectRatio="none">
      <path
        d={d}
        pathLength="1"
        className="stroke-foreground-600"
        strokeWidth="1"
        strokeDasharray="1"
        strokeDashoffset={1 - pathProgress}
      />
      {pathProgress > 0 && pathProgress < 1 && (
        <path
          d={d}
          pathLength="1"
          className="stroke-foreground-500"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="0.001 0.999"
          strokeDashoffset={1 - pathProgress}
        />
      )}
      {bits.map(({ key, elapsed, travel }) => {
        if (elapsed < 0 || elapsed >= travel) return null;

        return (
          <path
            key={key}
            d={d}
            pathLength="1"
            className="stroke-foreground-500"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${normalizedLength} ${1 - normalizedLength}`}
            strokeDashoffset={1 - elapsed / travel}
          />
        );
      })}
    </svg>
  );
};

export default AnimatedConnection;
