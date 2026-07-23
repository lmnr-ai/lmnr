import { cn } from "@/lib/utils";

interface CommandOutputProps {
  output?: string;
  failed?: boolean;
}

// A command's stdout/result text. The full string renders (no truncation) but
// the box caps at max-h-80 with internal scroll so a huge output can't swallow
// the timeline. `whitespace-pre` keeps table-ish output aligned.
export default function CommandOutput({ output, failed }: CommandOutputProps) {
  if (output === undefined || output.length === 0) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">No output</div>;
  }
  return (
    <pre
      className={cn(
        "max-h-80 overflow-auto whitespace-pre px-3 py-2 font-mono text-xs leading-5",
        failed ? "text-destructive" : "text-secondary-foreground"
      )}
    >
      {output}
    </pre>
  );
}
