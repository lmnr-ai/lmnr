interface LegendItemProps {
  color: string;
  opacity?: number;
  label: string;
}

export default function LegendItem({ color, opacity, label }: LegendItemProps) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="size-2 rounded-[2px]" style={{ background: color, opacity }} />
      {label}
    </span>
  );
}
