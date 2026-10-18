// A self-contained diagram: three benchmark pipelines side by side. Each flows
// top → bottom — a benchmark agent emits one trace, the trace fans out
// (S-curves) across five trace-analysis agents, and each one produces one issue
// whose colour is its real grade in the post's comparison table.
//
// One responsive SVG, everything inline and snapped to a CELL grid so nodes
// centre on the dots. The only motion is the node spinners (CSS); the paths are
// drawn statically.

import agentMark from "@/assets/landing/hero/agent-mark.svg";

const CELL = 14;
const CANVAS = { w: 560, h: 420 };
const center = (cell: number) => (cell + 0.5) * CELL;

const COLUMN_CELLS = [12, 23, 34];
const MODEL_OFFSETS = [-4, -2, 0, 2, 4]; // cells, left → right within a fan

const Y = { label: 38, agent: center(6), trace: center(12), model: center(20), issue: center(27) };

const AGENT_R = 13;
const MODEL_R = 8;
const SQUARE = 16;
const LABEL_X = 54;

const BENCHMARKS = ["τ²-bench", "TheAgentCompany", "Terminal Bench 2"];
// flow-1 is highlighted (leftmost); the rest are neutral.
const MODEL_COLORS = ["#8cb9ff", "#f0f0f0", "#f0f0f0", "#f0f0f0", "#f0f0f0"];

// Real grades from the post's table, left → right: flow-1, Opus, Sonnet, sol, luna.
const GREEN = "#26ae6c";
const YELLOW = "#fddb08";
const RED = "#f78079";
const ISSUE_COLORS = [
  [GREEN, GREEN, RED, RED, GREEN], // τ²-bench
  [GREEN, GREEN, GREEN, GREEN, GREEN], // TheAgentCompany
  [GREEN, GREEN, RED, RED, YELLOW], // Terminal Bench 2 (sol: noise, luna: partial)
];

const SURFACE = "var(--color-surface-350)";
const STROKE = "var(--color-foreground-600)";
const TEXT = "var(--color-foreground-100)";

const vline = (x: number, y1: number, y2: number) => `M${x} ${y1}V${y2}`;
const sCurve = (ax: number, ay: number, bx: number, by: number) => {
  const dy = by - ay;
  return `M${ax} ${ay}C${ax} ${ay + dy / 2} ${bx} ${by - dy / 2} ${bx} ${by}`;
};

// Warning triangle (viewBox 0 0 10 9.28654), centred in a SQUARE cell and scaled up a touch.
function IssueMark({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  const s = 1.1;
  const w = 10 * s;
  const h = 9.28654 * s;
  return (
    <g transform={`translate(${cx - w / 2} ${cy - h / 2}) scale(${s})`}>
      <path
        d="M5 0c-.822 0-1.582.438-1.993 1.15L.31 5.78C-.586 7.334.535 9.287 2.33 9.287h5.34c1.795 0 2.916-1.953 2.02-3.507L6.993 1.15A2.302 2.302 0 0 0 5 0Z"
        fill={color}
      />
      <path
        d="m4.515 5.934-.2-2.916V1.712H5.69v1.306l-.2 2.916h-.975Zm.357 2.176c-.198 0-.357-.055-.479-.166a.58.58 0 0 1-.174-.443c0-.186.058-.334.174-.444.122-.11.281-.166.479-.166h.26c.198 0 .355.056.471.166.122.11.183.258.183.444a.58.58 0 0 1-.183.443c-.116.11-.276.166-.479.166h-.252Z"
        fill={SURFACE}
      />
    </g>
  );
}

// A node: a coloured circle with the agent mark spinning on top (CSS only).
function Node({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  const s = r * 2 * 0.72;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={color} />
      <image
        href={agentMark.src}
        x={cx - s / 2}
        y={cy - s / 2}
        width={s}
        height={s}
        className="mmp-spin"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </>
  );
}

function Square({ cx, cy, children }: { cx: number; cy: number; children?: React.ReactNode }) {
  return (
    <>
      <rect x={cx - SQUARE / 2} y={cy - SQUARE / 2} width={SQUARE} height={SQUARE} fill={SURFACE} />
      {children}
    </>
  );
}

export default function MultiModelPipeline() {
  const columns = COLUMN_CELLS.map((col, p) => {
    const cx = center(col);
    const models = MODEL_OFFSETS.map((o) => center(col + o));
    return { cx, models, issues: ISSUE_COLORS[p], benchmark: BENCHMARKS[p] };
  });

  const labelStyle: React.CSSProperties = {
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    fontSize: 12,
    fontWeight: 500,
  };

  return (
    <div className="not-typeset my-8">
      <div className="flex justify-center overflow-hidden rounded-lg border bg-surface-200">
        <svg
          viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`}
          width="100%"
          style={{ maxWidth: CANVAS.w, height: "auto", display: "block" }}
          role="img"
          aria-label="Three benchmark pipelines: each trace is analyzed by five trace-analysis agents, each producing one graded issue."
        >
          <defs>
            <pattern id="mmp-dots" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
              <circle cx={CELL / 2} cy={CELL / 2} r={1.2} fill="#2e2e2e" />
            </pattern>
            <style>{`@keyframes mmp-spin{to{transform:rotate(360deg)}}.mmp-spin{animation:mmp-spin 1.2s linear infinite}@media(prefers-reduced-motion:reduce){.mmp-spin{animation:none}}`}</style>
          </defs>
          <rect width={CANVAS.w} height={CANVAS.h} fill="url(#mmp-dots)" />

          {/* Connections */}
          <g fill="none" stroke={STROKE} strokeWidth={1}>
            {columns.map(({ cx, models }, p) => (
              <g key={p}>
                <path d={vline(cx, Y.agent + AGENT_R, Y.trace - SQUARE / 2)} />
                {models.map((mx, m) => (
                  <path key={`tm-${m}`} d={sCurve(cx, Y.trace + SQUARE / 2, mx, Y.model - MODEL_R)} />
                ))}
                {models.map((mx, m) => (
                  <path key={`mi-${m}`} d={vline(mx, Y.model + MODEL_R, Y.issue - SQUARE / 2)} />
                ))}
              </g>
            ))}
          </g>

          {/* Nodes, traces and issues */}
          {columns.map(({ cx, models, issues }, p) => (
            <g key={p}>
              <Node cx={cx} cy={Y.agent} r={AGENT_R} color="#f0f0f0" />
              <Square cx={cx} cy={Y.trace}>
                <circle cx={cx} cy={Y.trace} r={1.5} fill="#808080" />
              </Square>
              {models.map((mx, m) => (
                <Node key={`n-${m}`} cx={mx} cy={Y.model} r={MODEL_R} color={MODEL_COLORS[m]} />
              ))}
              {models.map((mx, m) => (
                <Square key={`i-${m}`} cx={mx} cy={Y.issue}>
                  <IssueMark cx={mx} cy={Y.issue} color={issues[m]} />
                </Square>
              ))}
            </g>
          ))}

          {/* Benchmark labels above each column */}
          <g style={labelStyle} fill={TEXT} textAnchor="middle" dominantBaseline="central">
            {columns.map(({ cx, benchmark }, p) => (
              <text key={p} x={cx} y={Y.label}>
                {benchmark}
              </text>
            ))}
          </g>

          {/* Stage labels down the left */}
          <g style={labelStyle} fill={TEXT} textAnchor="middle" dominantBaseline="central">
            <text x={LABEL_X} y={Y.agent}>
              Agent
            </text>
            <text x={LABEL_X} y={Y.trace}>
              Trace
            </text>
            <text x={LABEL_X} y={Y.model}>
              <tspan x={LABEL_X} dy="-0.55em">
                Trace analysis
              </tspan>
              <tspan x={LABEL_X} dy="1.1em">
                agents
              </tspan>
            </text>
            <text x={LABEL_X} y={Y.issue}>
              Issues
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
