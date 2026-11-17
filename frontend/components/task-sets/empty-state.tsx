/** Shown when the project has no task sets yet: they arrive from lmnr-cli or the Laminar agent. */
export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <div className="text-sm font-medium">No task sets yet</div>
      <div className="max-w-md text-xs text-secondary-foreground">
        Task sets are versioned groups of eval tasks for an agent. Push the ones in{" "}
        <code className="font-mono">evals/&lt;agent&gt;/task_sets/</code> with{" "}
        <code className="font-mono">npx lmnr-cli eval push &lt;agent&gt;</code>, or run them with{" "}
        <code className="font-mono">eval run --remote</code>.
      </div>
    </div>
  );
}
