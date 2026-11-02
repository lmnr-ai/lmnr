import { type Rect } from "./geometry";

interface FixNodeProps {
  rect: Rect;
  scale: number;
  opacity: number;
  rotation: number;
}

const FixNode = ({ rect, scale, opacity, rotation }: FixNodeProps) => (
  <div
    data-grid-item
    className="absolute origin-center bg-surface-450"
    style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, opacity, transform: `scale(${scale})` }}
  >
    <svg aria-hidden="true" className="size-full" viewBox="0 0 60 60" fill="none">
      <path
        d="M46 30C46 21.1634 38.8366 14 30 14C21.1634 14 14 21.1634 14 30C14 38.8366 21.1634 46 30 46C32.0736 46 34.055 45.6055 35.8734 44.8876"
        stroke="#484848"
        strokeWidth={2}
        transform={`rotate(${rotation} 30 30)`}
      />
    </svg>
  </div>
);

export default FixNode;
