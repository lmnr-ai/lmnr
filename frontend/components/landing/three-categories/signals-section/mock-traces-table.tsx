import SpanTypeIcon from "@/components/traces/span-type-icon";
import { SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

type StatusKind = "success" | "error";

type MockTraceRow = {
  id: string;
  status: StatusKind;
  topSpanName: string;
  timestamp: string;
  durationSeconds: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  tags: { name: string; color: string }[];
};

const TAG_PRODUCTION = { name: "production", color: "#22c55e" };
const TAG_V2 = { name: "v2", color: "#3b82f6" };
const TAG_REGRESSION = { name: "regression", color: "#ef4444" };
const TAG_FLAKY = { name: "flaky", color: "#f59e0b" };
const TAG_BETA = { name: "beta", color: "#a855f7" };

const ROWS: MockTraceRow[] = [
  {
    id: "f3a1c0d8e9b24a5e",
    status: "success",
    topSpanName: "agent.run",
    timestamp: "Apr 26, 18:02:14",
    durationSeconds: 12.43,
    cost: 0.0421,
    inputTokens: 8421,
    outputTokens: 2104,
    tags: [TAG_PRODUCTION, TAG_V2],
  },
  {
    id: "9c12d8a44f0b6112",
    status: "error",
    topSpanName: "github.create_pr",
    timestamp: "Apr 26, 18:00:51",
    durationSeconds: 4.18,
    cost: 0.0094,
    inputTokens: 2104,
    outputTokens: 418,
    tags: [TAG_REGRESSION],
  },
  {
    id: "2b6e7a99c0d31e44",
    status: "success",
    topSpanName: "claude.opus",
    timestamp: "Apr 26, 17:58:09",
    durationSeconds: 6.92,
    cost: 0.0238,
    inputTokens: 5829,
    outputTokens: 1093,
    tags: [TAG_PRODUCTION],
  },
  {
    id: "8a04bf21d6e7c3aa",
    status: "error",
    topSpanName: "browser_agent",
    timestamp: "Apr 26, 17:56:33",
    durationSeconds: 28.74,
    cost: 0.1054,
    inputTokens: 18243,
    outputTokens: 3211,
    tags: [TAG_BETA, TAG_FLAKY],
  },
  {
    id: "5d09c4be8af71203",
    status: "success",
    topSpanName: "workflow.execute",
    timestamp: "Apr 26, 17:54:01",
    durationSeconds: 3.62,
    cost: 0.0058,
    inputTokens: 1218,
    outputTokens: 312,
    tags: [],
  },
  {
    id: "b7e0a318d2f54c91",
    status: "error",
    topSpanName: "gpt-4o.respond",
    timestamp: "Apr 26, 17:51:22",
    durationSeconds: 1.21,
    cost: 0.0019,
    inputTokens: 311,
    outputTokens: 0,
    tags: [TAG_REGRESSION, TAG_PRODUCTION],
  },
  {
    id: "1f9d3a72c4b58610",
    status: "success",
    topSpanName: "stripe.create_checkout",
    timestamp: "Apr 26, 17:48:47",
    durationSeconds: 0.84,
    cost: 0.0006,
    inputTokens: 142,
    outputTokens: 89,
    tags: [TAG_PRODUCTION],
  },
  {
    id: "4e2b8c01a9d6f5ee",
    status: "success",
    topSpanName: "agent.run",
    timestamp: "Apr 26, 17:45:18",
    durationSeconds: 4.71,
    cost: 0.0163,
    inputTokens: 3104,
    outputTokens: 728,
    tags: [TAG_V2],
  },
  {
    id: "c6e1f4a82bd03597",
    status: "success",
    topSpanName: "claude.haiku",
    timestamp: "Apr 26, 17:42:55",
    durationSeconds: 0.62,
    cost: 0.0004,
    inputTokens: 421,
    outputTokens: 31,
    tags: [],
  },
  {
    id: "a3d5e9c08b271146",
    status: "success",
    topSpanName: "search.web",
    timestamp: "Apr 26, 17:39:11",
    durationSeconds: 1.08,
    cost: 0.0011,
    inputTokens: 218,
    outputTokens: 142,
    tags: [TAG_PRODUCTION],
  },
  {
    id: "7f81b0e29ad3c544",
    status: "error",
    topSpanName: "agent.run",
    timestamp: "Apr 26, 17:35:48",
    durationSeconds: 17.92,
    cost: 0.0612,
    inputTokens: 11422,
    outputTokens: 2104,
    tags: [TAG_FLAKY],
  },
  {
    id: "0e4a7c92f1bd8836",
    status: "success",
    topSpanName: "eval.run",
    timestamp: "Apr 26, 17:31:24",
    durationSeconds: 42.18,
    cost: 0.2891,
    inputTokens: 53104,
    outputTokens: 8401,
    tags: [TAG_BETA],
  },
];

const STATUS_BAR_CLASS: Record<StatusKind, string> = {
  success: "bg-success-bright",
  error: "bg-destructive-bright",
};

const formatCost = (n: number) => `$${n.toFixed(n < 0.01 ? 5 : 4)}`;

const HEADER_CELLS: { label: string; widthClass: string }[] = [
  { label: "", widthClass: "w-10 shrink-0" },
  { label: "ID", widthClass: "w-[150px] shrink-0" },
  { label: "Root span", widthClass: "w-[180px] shrink-0" },
  { label: "Timestamp", widthClass: "w-[150px] shrink-0" },
  { label: "Duration", widthClass: "w-[80px] shrink-0" },
  { label: "Cost", widthClass: "w-[100px] shrink-0" },
  { label: "Tokens", widthClass: "w-[170px] shrink-0" },
  { label: "Tags", widthClass: "flex-1 min-w-[120px]" },
];

const MAX_VISIBLE_TAG_DOTS = 5;

const TagsPills = ({ tags }: { tags: { name: string; color: string }[] }) => {
  if (tags.length === 0) return <span className="text-secondary-foreground text-xs">-</span>;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex flex-row items-center -space-x-2 shrink-0">
        {tags.slice(0, MAX_VISIBLE_TAG_DOTS).map((tag) => (
          <div
            key={tag.name}
            className="size-4 rounded-full border-2 border-secondary"
            style={{ backgroundColor: tag.color }}
          />
        ))}
      </div>
      <span className="text-secondary-foreground text-xs truncate">
        {tags.length} tag{tags.length === 1 ? "" : "s"}
      </span>
    </div>
  );
};

const MockTracesTable = ({ className }: { className?: string }) => (
  <div className={cn("flex flex-col w-full overflow-hidden bg-secondary border rounded-md", className)}>
    <div className="flex border-b shrink-0 text-xs text-muted-foreground">
      {HEADER_CELLS.map((c, i) => (
        <div key={i} className={cn("px-4 py-1.5", c.widthClass)}>
          {c.label}
        </div>
      ))}
    </div>
    <div className="flex-1 min-h-0 overflow-hidden">
      {ROWS.map((row) => (
        <div key={row.id} className="flex border-b last:border-b-0 items-center text-sm">
          <div className="w-10 shrink-0 px-4 py-2">
            <div className={cn("min-h-6 w-1.5 rounded-[2.5px]", STATUS_BAR_CLASS[row.status])} />
          </div>
          <div className="w-[150px] shrink-0 px-4 py-2">
            <span className="font-mono text-xs text-secondary-foreground truncate block">{row.id}</span>
          </div>
          <div className="w-[180px] shrink-0 px-4 py-2 flex items-center gap-2 min-w-0">
            <SpanTypeIcon spanType={SpanType.DEFAULT} />
            <span className="text-sm truncate">{row.topSpanName}</span>
          </div>
          <div className="w-[150px] shrink-0 px-4 py-2 text-secondary-foreground text-xs">{row.timestamp}</div>
          <div className="w-[80px] shrink-0 px-4 py-2 text-secondary-foreground text-xs">
            {row.durationSeconds.toFixed(2)}s
          </div>
          <div className="w-[100px] shrink-0 px-4 py-2 text-secondary-foreground text-xs">{formatCost(row.cost)}</div>
          <div className="w-[170px] shrink-0 px-4 py-2 text-secondary-foreground text-xs truncate">
            {row.inputTokens}
            {" -> "}
            {row.outputTokens}
            {` (${row.inputTokens + row.outputTokens})`}
          </div>
          <div className="flex-1 min-w-[120px] px-4 py-2">
            <TagsPills tags={row.tags} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default MockTracesTable;
