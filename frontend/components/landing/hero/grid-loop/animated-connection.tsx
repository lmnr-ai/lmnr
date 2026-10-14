interface Props {
  ambientStart?: number;
  ambientTravelDuration?: number;
  bitColor: string;
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
  ambientStart,
  ambientTravelDuration,
  bitColor,
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
  if (ambientStart !== undefined && time >= ambientStart) {
    const travel = ambientTravelDuration ?? travelDuration;
    const first = Math.max(0, Math.ceil((time - ambientStart - travel) / interval));
    const last = Math.floor((time - ambientStart) / interval);
    for (let index = first; index <= last; index++) {
      bits.push({ key: `ambient-${index}`, elapsed: time - (ambientStart + index * interval), travel });
    }
  }

  return (
    <svg aria-hidden="true" className={className} viewBox={viewBox} fill="none" preserveAspectRatio="none">
      <path
        d={d}
        pathLength="1"
        stroke="#454545"
        strokeWidth="1"
        strokeDasharray="1"
        strokeDashoffset={1 - pathProgress}
      />
      {pathProgress > 0 && pathProgress < 1 && (
        <path
          d={d}
          pathLength="1"
          stroke={bitColor}
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
            stroke={bitColor}
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
