/** Shown when the project has no task sets yet: `eval push` (from lmnr-cli or the Laminar agent) creates them. */
export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <div className="text-sm font-medium">No task sets yet</div>
      <div className="max-w-md text-xs text-secondary-foreground">
        Task sets are versioned groups of eval tasks. Push the tasks in{" "}
        <code className="font-mono">evals/&lt;set&gt;/tasks/</code> with{" "}
        <code className="font-mono">npx lmnr-cli eval push &lt;set&gt;</code>.
      </div>
    </div>
  );
}
