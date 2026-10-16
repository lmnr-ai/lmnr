import Image from "next/image";

import agentMark from "@/assets/landing/hero/agent-mark.svg";

import { type Rect } from "./geometry";

interface AgentNodeProps {
  rect: Rect;
  color: string;
  scale: number;
  opacity: number;
  rotation: number;
}

const AgentNode = ({ rect, color, scale, opacity, rotation }: AgentNodeProps) => (
  <div
    data-grid-item
    className="absolute flex origin-center items-center justify-center bg-surface-250"
    style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, opacity, transform: `scale(${scale})` }}
  >
    <div className="flex size-[32px] items-center justify-center rounded-full" style={{ backgroundColor: color }}>
      <Image src={agentMark} alt="" className="size-[24px]" style={{ transform: `rotate(${rotation}deg)` }} />
    </div>
  </div>
);

export default AgentNode;
