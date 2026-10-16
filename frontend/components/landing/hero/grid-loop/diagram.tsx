import { type ReactNode } from "react";

import AgentNode from "./agent-node";
import AnimatedConnection from "./animated-connection";
import CellBox from "./cell-box";
import { EvalCell, IssueCell, TraceCell } from "./cells";
import { linear } from "./easing";
import FixNode from "./fix-node";
import { BOX_CELLS, CELL, type GridLoopLayout, LABEL_CELLS } from "./geometry";
import GridLabel from "./grid-label";
import {
  AMBIENT_START,
  BOX_FADE_DURATION,
  BOX_POPULATE,
  type ConnectionKey,
  CONNECTIONS,
  LABEL_FADE,
  NODE_ENTER,
  spinRotation,
  stageProgress,
} from "./timeline";

const BIT_FREQUENCY = 1 / 0.8;
const BIT_LENGTH = 12;
const AMBIENT_SPEED = 300;

const CONNECTION_KEYS = Object.keys(CONNECTIONS) as ConnectionKey[];
const DASHED: Partial<Record<ConnectionKey, number>> = { agentToEvals: 4 };

const BOXES: { key: keyof typeof BOX_CELLS; label: string; renderCell: (index: number) => ReactNode }[] = [
  { key: "traces", label: "Traces", renderCell: (index) => <TraceCell index={index} /> },
  { key: "issues", label: "Issues", renderCell: (index) => <IssueCell index={index} /> },
  { key: "evals", label: "Eval cases", renderCell: (index) => <EvalCell index={index} /> },
];

interface Props {
  layout: GridLoopLayout;
  /** Px from the dot grid's origin; must be a multiple of CELL to stay on the dots. */
  left: number;
  time: number;
}

// Sits one row down so an empty row of dots frames it above and below.
const Diagram = ({ layout, left, time }: Props) => {
  const { nodes, boxes, labels, connections, width, height } = layout;
  const enter = (key: keyof typeof NODE_ENTER) => stageProgress(time, NODE_ENTER[key]);

  return (
    <div className="absolute" style={{ left, top: CELL, width, height }}>
      {CONNECTION_KEYS.map((key, index) => {
        const { at, duration } = CONNECTIONS[key];
        const { d, length } = connections[key];
        return (
          <AnimatedConnection
            key={key}
            dashLength={DASHED[key]}
            // Stagger each road's phase so the settled loop doesn't pulse in sync.
            ambientStart={AMBIENT_START + index / CONNECTION_KEYS.length / BIT_FREQUENCY}
            ambientTravelDuration={length / AMBIENT_SPEED}
            bitFrequency={BIT_FREQUENCY}
            bitLength={BIT_LENGTH}
            className="absolute inset-0 h-full w-full overflow-visible"
            d={d}
            emissionStart={at}
            emissionEnd={at + duration}
            pathLength={length}
            pathProgress={stageProgress(time, CONNECTIONS[key], linear)}
            time={time}
            travelDuration={duration}
            viewBox={`0 0 ${width} ${height}`}
          />
        );
      })}

      {BOXES.map(({ key, label, renderCell }) => (
        <CellBox
          key={key}
          rect={boxes[key]}
          label={label}
          labelCells={LABEL_CELLS[key]}
          total={BOX_CELLS[key]}
          count={BOX_CELLS[key] * stageProgress(time, BOX_POPULATE[key])}
          opacity={stageProgress(time, { at: BOX_POPULATE[key].at, duration: BOX_FADE_DURATION })}
          renderCell={renderCell}
        />
      ))}

      <AgentNode
        rect={nodes.agent}
        color="#f0f0f0"
        scale={enter("agent")}
        opacity={enter("agent")}
        rotation={spinRotation(time, NODE_ENTER.agent)}
      />
      <AgentNode
        rect={nodes.flow}
        color="#8cb9ff"
        scale={enter("flow")}
        opacity={enter("flow")}
        rotation={spinRotation(time, NODE_ENTER.flow)}
      />
      <FixNode
        rect={nodes.fix}
        scale={enter("fix")}
        opacity={enter("fix")}
        rotation={spinRotation(time, NODE_ENTER.fix)}
      />

      <GridLabel rect={labels.agent} text="Your agent" opacity={enter("agent")} />
      <GridLabel rect={labels.flow} text="flow-1" opacity={enter("flow")} />
      <GridLabel rect={labels.fix} text="Fix" opacity={enter("fix")} />
      <GridLabel rect={labels.development} text="Development" opacity={stageProgress(time, LABEL_FADE.development)} />
      <GridLabel
        rect={labels.production}
        text="Production"
        opacity={stageProgress(time, LABEL_FADE.production)}
        align="center"
      />
    </div>
  );
};

export default Diagram;
