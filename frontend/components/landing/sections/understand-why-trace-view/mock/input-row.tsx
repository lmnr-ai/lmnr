import { ArrowRight } from "lucide-react";

import PreviewText from "./preview-text";

// The run's task, extracted at ingestion, heading the transcript. Not a span:
// it has no duration, no cost and nothing to select, which is why it is a blue
// band rather than a row.
const InputRow = ({ text }: { text: string }) => (
  <div className="flex">
    <div className="flex flex-col flex-1 min-w-0 py-2 pr-2 border-l-4 border-l-transparent gap-1 bg-blue-400/5 pl-1">
      <div className="flex gap-2 items-center min-w-0">
        <div className="flex items-center justify-center z-10 rounded shrink-0 bg-blue-400/70 w-5 h-5 min-w-5 min-h-5">
          <ArrowRight size={14} />
        </div>
        <span className="font-medium text-sm whitespace-nowrap shrink-0">Input</span>
      </div>
      <PreviewText text={text} className="pl-7" />
    </div>
  </div>
);

export default InputRow;
