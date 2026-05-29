import { cn } from "@/lib/utils";

type Props = {
  count: number;
  className?: string;
  selected?: boolean;
};

export default function RunCountBadge({ count, className, selected }: Props) {
  const label = count === 1 ? "1 run" : `${count} runs`;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0 text-[10px] font-medium tabular-nums",
        selected
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 bg-muted/60 text-muted-foreground",
        className
      )}
    >
      {label}
    </span>
  );
}
