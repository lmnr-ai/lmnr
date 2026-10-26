import { cn } from "@/lib/utils";

export default function PreviewTitle({ name }: { name: string }) {
  return (
    <div className="w-full mb-2">
      <span
        className={cn("font-medium text-lg truncate", name ? "text-secondary-foreground" : "text-muted-foreground")}
      >
        {name || "Untitled dashboard"}
      </span>
    </div>
  );
}
