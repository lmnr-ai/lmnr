import { type ReactNode } from "react";

import { CELL, type Rect } from "./geometry";

interface CellBoxProps {
  rect: Rect;
  label: string;
  labelCells: number;
  total: number;
  count: number;
  opacity: number;
  renderCell: (index: number) => ReactNode;
}

const CellBox = ({ rect, label, labelCells, total, count, opacity, renderCell }: CellBoxProps) => {
  const visible = Math.ceil(count);

  return (
    <div
      data-grid-item
      className="absolute flex flex-wrap content-start bg-surface-450"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, opacity }}
    >
      <div
        style={{ width: labelCells * CELL }}
        className="flex h-[20px] items-center pr-[6px] pl-[8px] font-sans-landing text-[12px] leading-none whitespace-nowrap text-foreground-200"
      >
        {label}
      </div>
      {Array.from({ length: total }, (_, index) => (
        <div
          key={index}
          className="size-[20px] border-r border-b border-surface-500"
          style={{ opacity: index < visible ? 1 : 0 }}
        >
          {renderCell(index)}
        </div>
      ))}
    </div>
  );
};

export default CellBox;
