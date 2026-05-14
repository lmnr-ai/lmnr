import { cn } from "@/lib/utils";

interface VersionBadgeProps {
  className?: string;
}

export default function VersionBadge({ className }: VersionBadgeProps) {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  if (!version) return null;

  return (
    <span
      title={version}
      className={cn(
        "text-xs leading-none text-muted-foreground/70 font-mono tabular-nums tracking-tight select-none",
        className
      )}
    >
      {version}
    </span>
  );
}
