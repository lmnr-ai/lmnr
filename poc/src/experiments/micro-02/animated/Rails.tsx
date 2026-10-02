export interface RailsProps {
  topProgress: number;
  bottomProgress: number;
}

const FORWARD_PATH = 'M12 0V473.5C12 583.957 101.543 673.5 212 673.5H1001';
const REVERSE_PATH = 'M1001 673.5H212C101.543 673.5 12 583.957 12 473.5V0';

const railWrapperStyle = (left: number, top: number, rotate = false) => ({
  position: 'absolute' as const,
  left,
  top,
  width: 989,
  height: 673.5,
  transform: rotate ? 'rotate(180deg)' : undefined,
  transformOrigin: '50% 50%',
  pointerEvents: 'none' as const,
});

const svgStyle = {
  position: 'absolute' as const,
  left: -12,
  top: 0,
  width: 1001,
  height: 685.5,
  overflow: 'visible',
};

const pathStyle = (progress: number) => ({
  strokeDasharray: 1,
  strokeDashoffset: 1 - Math.max(0, Math.min(1, progress)),
});

export const Rails = ({topProgress, bottomProgress}: RailsProps) => (
  <div data-animation="rails">
    <div style={railWrapperStyle(456, -461)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 1001 685.5"
        preserveAspectRatio="none"
        style={svgStyle}
      >
        <path
          d={FORWARD_PATH}
          pathLength={1}
          fill="none"
          stroke="#1E1E1F"
          strokeWidth={24}
          style={pathStyle(topProgress)}
        />
      </svg>
    </div>

    <div style={railWrapperStyle(-133, 570, true)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 1001 685.5"
        preserveAspectRatio="none"
        style={svgStyle}
      >
        <path
          d={REVERSE_PATH}
          pathLength={1}
          fill="none"
          stroke="#1E1E1F"
          strokeWidth={24}
          style={pathStyle(bottomProgress)}
        />
      </svg>
    </div>
  </div>
);
