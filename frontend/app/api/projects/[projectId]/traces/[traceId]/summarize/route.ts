import {
  type BlockSummaryInput,
  planPartitions,
  summarizeBlocks,
  summarizePartition,
  summarizeTopLevel,
} from "@/lib/actions/trace/diff/summarize";

interface PlanPartitionsBody {
  action: "plan-partitions";
  blocks: BlockSummaryInput[];
}

interface SummarizeBlocksBody {
  action: "summarize-blocks";
  blocks: BlockSummaryInput[];
}

interface SummarizePartitionBody {
  action: "summarize-partition";
  partitionRootSpanId: string;
  blocks: BlockSummaryInput[];
}

interface SummarizeTopLevelBody {
  action: "summarize-top-level";
  blocks: BlockSummaryInput[];
  deepSummaries: Record<string, string>;
  partitionRootIds: string[];
}

type RequestBody = PlanPartitionsBody | SummarizeBlocksBody | SummarizePartitionBody | SummarizeTopLevelBody;

export async function POST(req: Request, props: { params: Promise<{ projectId: string; traceId: string }> }) {
  const { projectId, traceId } = await props.params;
  const body = (await req.json()) as RequestBody;
  const shortTrace = traceId.slice(0, 8);
  const tag =
    body.action === "summarize-partition" ? `${body.action}[${body.partitionRootSpanId.slice(0, 8)}]` : body.action;
  const t0 = performance.now();
  console.log(`[summarize] START ${tag} trace=${shortTrace} t=${new Date().toISOString()}`);

  try {
    let result: Response;
    switch (body.action) {
      case "plan-partitions": {
        const plan = await planPartitions(projectId, traceId, body.blocks);
        const partCount = plan?.partitions.length ?? 0;
        console.log(
          `[summarize] END   ${tag} trace=${shortTrace} ${(performance.now() - t0).toFixed(0)}ms partitions=${partCount}`
        );
        return Response.json({ plan });
      }
      case "summarize-blocks": {
        const results = await summarizeBlocks(projectId, traceId, body.blocks);
        console.log(
          `[summarize] END   ${tag} trace=${shortTrace} ${(performance.now() - t0).toFixed(0)}ms results=${results.length}`
        );
        return Response.json({ results });
      }
      case "summarize-partition": {
        const r = await summarizePartition(projectId, traceId, body.partitionRootSpanId, body.blocks);
        console.log(
          `[summarize] END   ${tag} trace=${shortTrace} ${(performance.now() - t0).toFixed(0)}ms results=${r.results.length}`
        );
        return Response.json(r);
      }
      case "summarize-top-level": {
        const results = await summarizeTopLevel(
          projectId,
          traceId,
          body.blocks,
          body.deepSummaries,
          body.partitionRootIds
        );
        console.log(
          `[summarize] END   ${tag} trace=${shortTrace} ${(performance.now() - t0).toFixed(0)}ms results=${results.length}`
        );
        return Response.json({ results });
      }
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error(`[summarize] ERROR ${tag} trace=${shortTrace} ${(performance.now() - t0).toFixed(0)}ms`, error);
    return Response.json({ error: error instanceof Error ? error.message : "Summarization failed" }, { status: 500 });
  }
}
