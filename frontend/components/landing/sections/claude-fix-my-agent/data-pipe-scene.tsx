"use client";

import { useState } from "react";

import laminarIcon from "@/assets/logo/icon.svg";

import DebuggerScene from "./debugger-scene";
import type { TransferProgress } from "./debugger-types";

const SOURCE_BLOCK = { x: 754, y: 405, size: 76, iconSize: 29 } as const;
const PIPE_PATH = `M${SOURCE_BLOCK.x + SOURCE_BLOCK.size / 2} ${SOURCE_BLOCK.y + SOURCE_BLOCK.size}V443H740`;

const DataPipeScene = () => {
  const [transfer, setTransfer] = useState<TransferProgress>();

  return (
    <div className="relative w-full overflow-hidden bg-surface-250">
      {/* Let the stage narrow with its panel while its terminal stays fixed-width.
          As in the evals section, auto margins center the terminal when it fits
          and collapse when it does not, pinning it left and overflowing right. */}
      <div className="relative mx-auto w-full max-w-[880px]">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          width="880"
          height="624"
          viewBox="0 0 880 624"
          fill="none"
        >
          <path d={PIPE_PATH} stroke="var(--color-foreground-600)" strokeWidth="1" />
          <path
            d={PIPE_PATH}
            pathLength="100"
            stroke="var(--color-primary-400)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeDasharray="100"
            strokeDashoffset={(1 - (transfer?.pipe ?? 0)) * 100}
            opacity={transfer === undefined ? 0 : 1}
          />
        </svg>

        <div className="relative z-10">
          <DebuggerScene onTransferProgressChange={setTransfer} />
        </div>

        <div
          className="absolute z-20 flex items-center justify-center rounded-md"
          style={{
            backgroundColor: "var(--color-surface-150)",
            height: SOURCE_BLOCK.size,
            left: SOURCE_BLOCK.x,
            top: SOURCE_BLOCK.y,
            width: SOURCE_BLOCK.size,
          }}
        >
          <span
            aria-label="Laminar"
            className="block"
            role="img"
            style={{
              backgroundColor: transfer === undefined ? "var(--color-surface-400)" : "var(--color-foreground-200)",
              height: SOURCE_BLOCK.iconSize,
              maskImage: `url(${laminarIcon.src})`,
              maskRepeat: "no-repeat",
              maskSize: "contain",
              transition: "background-color 200ms ease",
              width: SOURCE_BLOCK.iconSize,
              WebkitMaskImage: `url(${laminarIcon.src})`,
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskSize: "contain",
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default DataPipeScene;
