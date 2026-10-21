"use client";

import { RotateCcw } from "lucide-react";

import AnimatedConnection from "./animated-connection";
import { CellBox } from "./cells";
import { BOX_CELLS, CANVAS, CELL, CONNECTIONS, LAYOUT, ORIGIN } from "./geometry";
import { DotGrid, GridLabel, ProcessNode } from "./nodes";
import {
  arrivalCount,
  BIT_FREQUENCY,
  BIT_TRAVEL,
  CONNECTORS,
  END_TIME,
  GROW_DURATION,
  NODE_GROW_AT,
  stageProgress,
} from "./timeline";
import { useFitScale } from "./use-fit-scale";
import { usePlaybackTime } from "./use-playback-time";

const CANVAS_WIDTH = CANVAS.cols * CELL;
const CANVAS_HEIGHT = CANVAS.rows * CELL;
const BIT_LENGTH = 12;

type ConnectionKey = keyof typeof CONNECTIONS;
const CONNECTION_KEYS = Object.keys(CONNECTIONS) as ConnectionKey[];

export default function SignalsPipeline() {
  const { time, replay } = usePlaybackTime(END_TIME);
  const { ref, scale } = useFitScale<HTMLDivElement>(CANVAS_WIDTH);
  const grow = (key: keyof typeof NODE_GROW_AT) => stageProgress(time, NODE_GROW_AT[key], GROW_DURATION);
  const { nodes, boxes, labels } = LAYOUT;

  return (
    <div className="not-typeset relative my-8">
      <div ref={ref} className="flex justify-center overflow-hidden rounded-lg border bg-surface-400">
        <div
          className="relative shrink-0"
          style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, zoom: scale }}
          aria-hidden
        >
          <DotGrid width={CANVAS_WIDTH} height={CANVAS_HEIGHT} cell={CELL} />
          <div
            className="absolute"
            style={{ left: ORIGIN.x, top: ORIGIN.y, width: LAYOUT.width, height: LAYOUT.height }}
          >
            {CONNECTION_KEYS.map((key) => {
              const { drawAt, drawDuration, emitStart, emitEnd } = CONNECTORS[key];
              const { d, length } = CONNECTIONS[key];
              return (
                <AnimatedConnection
                  key={key}
                  bitFrequency={BIT_FREQUENCY}
                  bitLength={BIT_LENGTH}
                  className="absolute inset-0 h-full w-full overflow-visible"
                  d={d}
                  emissionStart={emitStart}
                  emissionEnd={emitEnd}
                  pathLength={length}
                  pathProgress={stageProgress(time, drawAt, drawDuration)}
                  time={time}
                  travelDuration={BIT_TRAVEL}
                  viewBox={`0 0 ${LAYOUT.width} ${LAYOUT.height}`}
                />
              );
            })}

            <CellBox
              rect={boxes.traces}
              kind="traces"
              count={arrivalCount(time, CONNECTORS.agentToTraces, BOX_CELLS.traces)}
              opacity={grow("traces")}
            />
            <CellBox
              rect={boxes.issues}
              kind="issues"
              count={arrivalCount(time, CONNECTORS.signalToEvents, BOX_CELLS.issues)}
              opacity={grow("events")}
            />
            <ProcessNode rect={nodes.agent} color="#f0f0f0" reveal={grow("agent")} />
            <ProcessNode rect={nodes.flow} color="#8cb9ff" reveal={grow("signal")} />

            <GridLabel rect={labels.agent} text="Your agent" opacity={grow("agent")} />
            <GridLabel rect={labels.traces} text="Traces" opacity={grow("traces")} />
            <GridLabel rect={labels.flow} text="flow-1" opacity={grow("signal")} />
            <GridLabel rect={labels.issues} text="Issues" opacity={grow("events")} />
          </div>
        </div>
      </div>
      {time >= END_TIME && (
        <button
          type="button"
          onClick={replay}
          aria-label="Replay animation"
          className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-full bg-surface-500 text-foreground-400 transition-colors animate-in fade-in duration-200 hover:overlay-hover active:overlay-selected"
        >
          <RotateCcw className="size-4" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
