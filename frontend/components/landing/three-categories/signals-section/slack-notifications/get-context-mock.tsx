import { X } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const TABS = [
  { id: "agent_failure", label: "agent_failure", active: true },
  { id: "user_friction", label: "user_friction", active: false },
];

const FIELDS: { name: string; value: string }[] = [
  { name: "category", value: "logic_error" },
  {
    name: "summary",
    value: "The LLM in the 'refine_report' task ignored the 3-4 sentence limit and produced a 9-sentence summary.",
  },
];

const GetContextMock = ({ className }: Props) => (
  <div
    className={cn(
      "flex flex-col rounded-md border border-blue-400/30 bg-blue-400/12 overflow-hidden font-sans select-none opacity-80 gap-1 p-1",
      className
    )}
  >
    <div className="flex items-center justify-between pl-2.5 pr-2 pt-1.5 shrink-0">
      <span className="text-xs font-medium text-blue-200/60">Signal events</span>
      <X className="size-3.5 text-blue-200/60" />
    </div>

    <div className="flex flex-col px-2">
      <div className="inline-flex h-8 w-full items-center justify-center rounded-lg p-[3px] bg-blue-300/10 shrink-0">
        {TABS.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "flex-1 h-full flex items-center justify-center rounded-md text-xs px-2 truncate",
              tab.active ? "bg-gray-900 text-foreground shadow-sm" : "text-foreground/80"
            )}
          >
            {tab.label}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 py-1.5">
        {FIELDS.map((field) => (
          <div key={field.name} className="rounded-md border border-blue-200/10 bg-blue-300/5 px-2 py-1.5">
            <div className="text-xs text-blue-200/60 mb-0.5">{field.name}</div>
            <div className="text-xs text-secondary-foreground line-clamp-2 whitespace-pre-wrap break-words">
              {field.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default GetContextMock;
