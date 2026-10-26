import { ChartType } from "@/components/chart-builder/types";

const INK = "var(--color-emphasis-2)";
const LINE_WIDTH = 2;
const TABLE_WIDTH = 1;
const NOMINAL_PADDING = 4;
const PADDING = `${NOMINAL_PADDING}px`;
// Spacing between marks: bigger means fewer, chunkier marks.
const LINE_STEP = 8;
const BAR_PITCH = 9;
const ROW_PITCH = 6;
const TABLE_ROW_PITCH = 10;

// Seeded from the chart id so a thumbnail draws the same shape on every render.
const seededRandom = (seed: string) => {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4_294_967_296;
  };
};

interface ChartGlyphProps {
  type?: ChartType;
  seed: string;
  width: number;
  height: number;
}

/** A data-free sketch of a chart type: jittery line, fake bars, or a two-column table. */
const ChartGlyph = ({ type, seed, width, height }: ChartGlyphProps) => {
  const random = seededRandom(seed);
  const w = width - NOMINAL_PADDING * 2;
  const h = height - NOMINAL_PADDING * 2;
  if (!type || w <= 0 || h <= 0) return null;

  let marks;
  if (type === ChartType.LineChart) {
    const steps = Math.max(4, Math.round(w / LINE_STEP));
    let y = 0.5;
    const points = Array.from({ length: steps + 1 }, (_, i) => {
      y = Math.min(0.95, Math.max(0.05, y + (random() - 0.5) * 0.9));
      return `${((i / steps) * w).toFixed(1)},${(h - y * h).toFixed(1)}`;
    });
    marks = (
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={INK}
        strokeWidth={LINE_WIDTH}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    );
  } else if (type === ChartType.BarChart) {
    const count = Math.max(3, Math.floor(w / BAR_PITCH));
    const pitch = w / count;
    marks = Array.from({ length: count }, (_, i) => {
      const barHeight = h * (0.2 + random() * 0.8);
      return <rect key={i} x={i * pitch} y={h - barHeight} width={pitch - 2.5} height={barHeight} fill={INK} />;
    });
  } else if (type === ChartType.HorizontalBarChart) {
    const count = Math.max(1, Math.floor(h / ROW_PITCH));
    let barWidth = 1;
    marks = Array.from({ length: count }, (_, i) => {
      barWidth *= 0.6 + random() * 0.4;
      return <rect key={i} x={0} y={i * ROW_PITCH} width={w * barWidth} height={ROW_PITCH - 2} fill={INK} />;
    });
  } else {
    const rule = { stroke: INK, strokeWidth: TABLE_WIDTH, vectorEffect: "non-scaling-stroke" as const };
    marks = (
      <>
        <rect x={0} y={0} width={w} height={h} fill="none" {...rule} />
        {/* Interior rules only, so none doubles up on the outline. */}
        {Array.from({ length: Math.ceil(h / TABLE_ROW_PITCH) - 1 }, (_, i) => (
          <line key={i} x1={0} x2={w} y1={(i + 1) * TABLE_ROW_PITCH} y2={(i + 1) * TABLE_ROW_PITCH} {...rule} />
        ))}
        <line x1={w / 2} x2={w / 2} y1={0} y2={h} {...rule} />
      </>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      // Visible overflow keeps the outer half of edge strokes from being clipped.
      className="absolute overflow-visible"
      // An SVG keeps its intrinsic size under `inset`, so size it explicitly.
      style={{
        top: PADDING,
        left: PADDING,
        width: `calc(100% - 2 * ${PADDING})`,
        height: `calc(100% - 2 * ${PADDING})`,
      }}
    >
      {marks}
    </svg>
  );
};

export default ChartGlyph;
