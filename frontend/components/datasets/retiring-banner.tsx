import { ArrowUpRight, Info } from "lucide-react";

// Added by lmnr-ai/docs#297; 404s until it merges.
const NEW_DATASETS_DOCS_URL = "https://docs.laminar.sh/datasets/overview";

export default function RetiringDatasetsBanner() {
  return (
    <div className="flex w-fit items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Info className="size-3.5 shrink-0" />
      <span>We&apos;re retiring datasets.</span>
      <a
        href={NEW_DATASETS_DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 font-medium text-secondary-foreground hover:text-foreground"
      >
        Read about the new datasets
        <ArrowUpRight className="size-3" />
      </a>
    </div>
  );
}
