"use client";

import { useState } from "react";

import {
  DataTableComponent,
  ErrorAnalysisCard,
  EvalScoreCardComponent,
  MetricsCardComponent,
  SpanTimelineComponent,
  TraceSummaryCard,
} from "@/components/ai-chat/render-components";
import type {
  DataTableData,
  ErrorAnalysisData,
  EvalScoreCardData,
  MetricsCardData,
  SpanTimelineData,
  TraceSummaryData,
} from "@/components/ai-chat/render-components/types";

// ──── Demo Data ────

const traceSummaryData: TraceSummaryData = {
  traceId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  status: "success",
  startTime: "2026-03-12T10:30:00.000Z",
  endTime: "2026-03-12T10:30:02.450Z",
  totalSpans: 12,
  errorCount: 0,
  topLevelSpans: [
    { name: "POST /api/chat", spanId: "1", status: "success", durationMs: 2450 },
    { name: "openai.chat.completions", spanId: "2", status: "success", durationMs: 1890 },
    { name: "rag.retrieve", spanId: "3", status: "success", durationMs: 340 },
    { name: "db.query", spanId: "4", status: "success", durationMs: 45 },
  ],
  totalTokens: 3420,
  totalCost: 0.0234,
  summary:
    "User asked about deployment status. RAG retrieval found 3 relevant docs, LLM generated a comprehensive response about the current CI/CD pipeline state.",
};

const traceSummaryErrorData: TraceSummaryData = {
  traceId: "f9e8d7c6-b5a4-3210-fedc-ba9876543210",
  status: "error",
  startTime: "2026-03-12T11:15:00.000Z",
  endTime: "2026-03-12T11:15:05.200Z",
  totalSpans: 8,
  errorCount: 2,
  topLevelSpans: [
    { name: "POST /api/analyze", spanId: "10", status: "success", durationMs: 5200 },
    { name: "openai.chat.completions", spanId: "11", status: "error", durationMs: 3100 },
    { name: "tool.web_search", spanId: "12", status: "error", durationMs: 1500 },
    { name: "db.insert", spanId: "13", status: "success", durationMs: 22 },
  ],
  totalTokens: 8500,
  totalCost: 0.0891,
  summary:
    "Analysis request failed. The web search tool timed out after 1.5s, and the LLM encountered a context length error when trying to process the full document. 2 out of 8 spans errored.",
};

const metricsData: MetricsCardData = {
  title: "Last 24 Hours Overview",
  metrics: [
    { label: "Total Traces", value: 15420, format: "number", change: 12.5 },
    { label: "Avg Latency", value: 1240, format: "duration", change: -8.3, lowerIsBetter: true },
    { label: "Total Cost", value: 42.87, format: "currency", change: 5.2, lowerIsBetter: true },
    { label: "Error Rate", value: 0.034, format: "percent", change: -15.7, lowerIsBetter: true },
    { label: "Total Tokens", value: 2450000, format: "tokens" },
    { label: "Success Rate", value: 0.966, format: "percent", change: 2.1 },
  ],
};

const spanTimelineData: SpanTimelineData = {
  traceId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  totalDurationMs: 2450,
  spans: [
    { spanId: "1", name: "POST /api/chat", startOffsetMs: 0, durationMs: 2450, status: "success", depth: 0 },
    { spanId: "2", name: "auth.verify", startOffsetMs: 5, durationMs: 15, status: "success", depth: 1 },
    {
      spanId: "3",
      name: "rag.retrieve",
      startOffsetMs: 25,
      durationMs: 340,
      status: "success",
      depth: 1,
      spanType: "retriever",
    },
    { spanId: "4", name: "db.query", startOffsetMs: 30, durationMs: 45, status: "success", depth: 2, spanType: "db" },
    {
      spanId: "5",
      name: "embedding.create",
      startOffsetMs: 80,
      durationMs: 180,
      status: "success",
      depth: 2,
      spanType: "llm",
    },
    { spanId: "6", name: "vector.search", startOffsetMs: 265, durationMs: 95, status: "success", depth: 2 },
    {
      spanId: "7",
      name: "openai.chat",
      startOffsetMs: 370,
      durationMs: 1890,
      status: "success",
      depth: 1,
      spanType: "llm",
    },
    {
      spanId: "8",
      name: "tool.calculator",
      startOffsetMs: 1200,
      durationMs: 12,
      status: "success",
      depth: 2,
      spanType: "tool",
    },
    {
      spanId: "9",
      name: "openai.chat.retry",
      startOffsetMs: 1220,
      durationMs: 980,
      status: "success",
      depth: 2,
      spanType: "llm",
    },
    { spanId: "10", name: "response.format", startOffsetMs: 2265, durationMs: 45, status: "success", depth: 1 },
    { spanId: "11", name: "db.log", startOffsetMs: 2320, durationMs: 22, status: "success", depth: 1, spanType: "db" },
    { spanId: "12", name: "cache.set", startOffsetMs: 2350, durationMs: 8, status: "error", depth: 1 },
  ],
};

const errorAnalysisData: ErrorAnalysisData = {
  totalErrors: 47,
  timeRange: "Last 24 hours",
  errors: [
    {
      message: "Rate limit exceeded: 429 Too Many Requests",
      count: 23,
      firstSeen: "2026-03-11T14:30:00.000Z",
      lastSeen: "2026-03-12T10:15:00.000Z",
      spanName: "openai.chat.completions",
      severity: "error",
    },
    {
      message: "Connection timeout after 30000ms",
      count: 8,
      firstSeen: "2026-03-11T18:00:00.000Z",
      lastSeen: "2026-03-12T09:45:00.000Z",
      spanName: "tool.web_search",
      severity: "critical",
    },
    {
      message: "Context length exceeded: max 128000 tokens",
      count: 5,
      firstSeen: "2026-03-12T02:00:00.000Z",
      lastSeen: "2026-03-12T10:30:00.000Z",
      spanName: "openai.chat.completions",
      severity: "error",
    },
    {
      message: "Invalid JSON in tool response",
      count: 4,
      firstSeen: "2026-03-12T06:00:00.000Z",
      lastSeen: "2026-03-12T08:30:00.000Z",
      spanName: "tool.parser",
      severity: "warning",
    },
    {
      message: "Vector store connection refused",
      count: 3,
      firstSeen: "2026-03-12T03:00:00.000Z",
      lastSeen: "2026-03-12T03:15:00.000Z",
      spanName: "rag.retrieve",
      severity: "critical",
    },
    {
      message: "Embedding model unavailable",
      count: 2,
      firstSeen: "2026-03-12T09:00:00.000Z",
      lastSeen: "2026-03-12T09:05:00.000Z",
      spanName: "embedding.create",
      severity: "warning",
    },
    {
      message: "Memory limit reached during processing",
      count: 2,
      firstSeen: "2026-03-12T07:00:00.000Z",
      lastSeen: "2026-03-12T07:30:00.000Z",
      severity: "critical",
    },
  ],
  summary:
    "Rate limiting is the primary issue (49% of errors). The OpenAI API rate limit is being hit frequently during peak hours. Connection timeouts to the web search tool suggest network instability. Context length errors indicate some user inputs are too large.",
};

const dataTableData: DataTableData = {
  title: "Top 10 Slowest Traces",
  columns: [
    { key: "trace_id", label: "Trace ID", format: "text" },
    { key: "name", label: "Root Span", format: "text" },
    { key: "duration", label: "Duration", format: "duration" },
    { key: "status", label: "Status", format: "badge" },
    { key: "tokens", label: "Tokens", format: "number" },
    { key: "cost", label: "Cost", format: "currency" },
    { key: "start_time", label: "Time", format: "date" },
  ],
  rows: [
    {
      trace_id: "a1b2c3d4",
      name: "POST /api/analyze",
      duration: 12500,
      status: "success",
      tokens: 15200,
      cost: 0.156,
      start_time: "2026-03-12T10:30:00.000Z",
    },
    {
      trace_id: "e5f67890",
      name: "POST /api/chat",
      duration: 8900,
      status: "success",
      tokens: 8400,
      cost: 0.089,
      start_time: "2026-03-12T10:25:00.000Z",
    },
    {
      trace_id: "abcdef12",
      name: "POST /api/summarize",
      duration: 7200,
      status: "error",
      tokens: 12000,
      cost: 0.124,
      start_time: "2026-03-12T10:20:00.000Z",
    },
    {
      trace_id: "34567890",
      name: "POST /api/chat",
      duration: 6800,
      status: "success",
      tokens: 6200,
      cost: 0.067,
      start_time: "2026-03-12T10:15:00.000Z",
    },
    {
      trace_id: "bcdef123",
      name: "POST /api/embed",
      duration: 5400,
      status: "success",
      tokens: 3200,
      cost: 0.034,
      start_time: "2026-03-12T10:10:00.000Z",
    },
    {
      trace_id: "cdef1234",
      name: "POST /api/analyze",
      duration: 4900,
      status: "error",
      tokens: 9800,
      cost: 0.102,
      start_time: "2026-03-12T10:05:00.000Z",
    },
    {
      trace_id: "def12345",
      name: "POST /api/chat",
      duration: 4200,
      status: "success",
      tokens: 4500,
      cost: 0.048,
      start_time: "2026-03-12T10:00:00.000Z",
    },
    {
      trace_id: "ef123456",
      name: "POST /api/rag",
      duration: 3800,
      status: "success",
      tokens: 5600,
      cost: 0.059,
      start_time: "2026-03-12T09:55:00.000Z",
    },
    {
      trace_id: "f1234567",
      name: "POST /api/chat",
      duration: 3500,
      status: "success",
      tokens: 4100,
      cost: 0.043,
      start_time: "2026-03-12T09:50:00.000Z",
    },
    {
      trace_id: "12345678",
      name: "POST /api/analyze",
      duration: 3200,
      status: "error",
      tokens: 7800,
      cost: 0.081,
      start_time: "2026-03-12T09:45:00.000Z",
    },
  ],
  totalRows: 10,
  query:
    "SELECT trace_id, name, end_time - start_time as duration, status, total_tokens, total_cost FROM traces ORDER BY duration DESC LIMIT 10",
};

const evalScoreData: EvalScoreCardData = {
  evaluationName: "RAG Quality Assessment v2.3",
  evaluationId: "eval-abc123-def456",
  scores: [
    {
      name: "Relevance",
      average: 0.82,
      min: 0.15,
      max: 1.0,
      median: 0.87,
      distribution: [
        { bucket: "0.0-0.2", count: 3 },
        { bucket: "0.2-0.4", count: 5 },
        { bucket: "0.4-0.6", count: 12 },
        { bucket: "0.6-0.8", count: 28 },
        { bucket: "0.8-1.0", count: 52 },
      ],
    },
    {
      name: "Faithfulness",
      average: 0.91,
      min: 0.45,
      max: 1.0,
      median: 0.95,
      distribution: [
        { bucket: "0.0-0.2", count: 0 },
        { bucket: "0.2-0.4", count: 1 },
        { bucket: "0.4-0.6", count: 4 },
        { bucket: "0.6-0.8", count: 15 },
        { bucket: "0.8-1.0", count: 80 },
      ],
    },
    {
      name: "Completeness",
      average: 0.68,
      min: 0.1,
      max: 0.98,
      median: 0.72,
      distribution: [
        { bucket: "0.0-0.2", count: 8 },
        { bucket: "0.2-0.4", count: 14 },
        { bucket: "0.4-0.6", count: 22 },
        { bucket: "0.6-0.8", count: 32 },
        { bucket: "0.8-1.0", count: 24 },
      ],
    },
  ],
  totalDatapoints: 100,
  summary:
    "Faithfulness scores are strong (avg 0.91), indicating the model rarely hallucinates. Relevance is good (avg 0.82) but completeness needs improvement (avg 0.68) — the model often misses secondary details from source documents.",
};

// ──── Demo Scenarios ────

interface DemoScenario {
  id: string;
  title: string;
  description: string;
  userMessage: string;
  components: React.ReactNode;
}

const scenarios: DemoScenario[] = [
  {
    id: "trace-summary",
    title: 'Scenario 1: "What happened in this trace?"',
    description:
      "User is viewing a trace and asks for a summary. The AI responds with a rich TraceSummary card showing status, duration, top spans, and cost at a glance.",
    userMessage: "What happened in this trace? Give me a summary.",
    components: (
      <div className="space-y-3">
        <TraceSummaryCard data={traceSummaryData} />
        <p className="text-sm text-muted-foreground px-1">
          This trace processed a chat API request successfully in 2.45s. The RAG retrieval found relevant documents, and
          the LLM generated a response about the deployment status. Total cost was $0.0234 using 3,420 tokens.
        </p>
      </div>
    ),
  },
  {
    id: "error-trace",
    title: 'Scenario 2: "Why did this trace fail?"',
    description:
      "User is viewing a failed trace. The AI shows the trace summary card with error indicators and follows up with an error analysis.",
    userMessage: "Why did this trace fail? What went wrong?",
    components: (
      <div className="space-y-3">
        <TraceSummaryCard data={traceSummaryErrorData} />
        <ErrorAnalysisCard
          data={{
            totalErrors: 2,
            timeRange: "This trace",
            errors: [
              {
                message: "Connection timeout after 30000ms",
                count: 1,
                firstSeen: "2026-03-12T11:15:01.500Z",
                lastSeen: "2026-03-12T11:15:01.500Z",
                spanName: "tool.web_search",
                severity: "critical",
              },
              {
                message: "Context length exceeded: max 128000 tokens",
                count: 1,
                firstSeen: "2026-03-12T11:15:03.100Z",
                lastSeen: "2026-03-12T11:15:03.100Z",
                spanName: "openai.chat.completions",
                severity: "error",
              },
            ],
            summary:
              "The trace failed due to two cascading issues: the web search tool timed out, and then the LLM hit a context length limit when trying to process the accumulated input.",
          }}
        />
      </div>
    ),
  },
  {
    id: "metrics-overview",
    title: 'Scenario 3: "How is my app performing today?"',
    description:
      "User asks about overall performance. The AI queries the database and presents key metrics in a clean card layout with change indicators.",
    userMessage: "How is my app performing today? Any issues?",
    components: (
      <div className="space-y-3">
        <MetricsCardComponent data={metricsData} />
        <p className="text-sm text-muted-foreground px-1">
          Overall performance is healthy. Traces are up 12.5% while average latency dropped by 8.3%. Error rate is low
          at 3.4% and has been decreasing. Total spend is $42.87, up 5.2% from yesterday which correlates with the
          increased traffic.
        </p>
      </div>
    ),
  },
  {
    id: "span-timeline",
    title: 'Scenario 4: "Show me the latency breakdown"',
    description:
      "User wants to understand where time is being spent in a trace. The AI renders an interactive timeline waterfall chart showing span execution.",
    userMessage: "Show me the latency breakdown for this trace. Where is time being spent?",
    components: (
      <div className="space-y-3">
        <SpanTimelineComponent data={spanTimelineData} />
        <p className="text-sm text-muted-foreground px-1">
          The LLM call at <code className="bg-secondary rounded px-1 text-xs">openai.chat</code> dominates at 1.89s (77%
          of total). Within that, there's a retry that adds 980ms. The RAG retrieval takes 340ms with the embedding
          creation being the slowest sub-step at 180ms.
        </p>
      </div>
    ),
  },
  {
    id: "error-analysis",
    title: 'Scenario 5: "What errors are happening?"',
    description:
      "User asks about error patterns across their system. The AI queries for errors and presents a categorized analysis with severity, frequency, and timing.",
    userMessage: "What errors are happening in my system? Show me the patterns.",
    components: (
      <div className="space-y-3">
        <ErrorAnalysisCard data={errorAnalysisData} />
      </div>
    ),
  },
  {
    id: "data-table",
    title: 'Scenario 6: "Show me the slowest traces"',
    description:
      "User asks a data question. The AI executes a SQL query and presents the results in a sortable, formatted data table with status badges and proper formatting.",
    userMessage: "Show me the 10 slowest traces from today.",
    components: (
      <div className="space-y-3">
        <DataTableComponent data={dataTableData} />
        <p className="text-sm text-muted-foreground px-1">
          The slowest trace took 12.5s on the /api/analyze endpoint. Three of the top 10 slowest traces resulted in
          errors. The analyze endpoint appears most frequently among slow traces, suggesting it could benefit from
          optimization.
        </p>
      </div>
    ),
  },
  {
    id: "eval-scores",
    title: 'Scenario 7: "How did the evaluation go?"',
    description:
      "User is reviewing an evaluation and asks about results. The AI presents a score card with distributions, statistics, and a mini bar chart for each score.",
    userMessage: "How did the RAG Quality evaluation go? Summarize the results.",
    components: (
      <div className="space-y-3">
        <EvalScoreCardComponent data={evalScoreData} />
      </div>
    ),
  },
  {
    id: "combined",
    title: 'Scenario 8: Combined — "Full investigation"',
    description:
      "User asks for a comprehensive investigation. The AI combines multiple render tools to tell a complete story with metrics, errors, and a data table.",
    userMessage: "Give me a full investigation of what's happening with my system in the last 24 hours.",
    components: (
      <div className="space-y-3">
        <MetricsCardComponent
          data={{
            title: "System Health — Last 24h",
            metrics: [
              { label: "Total Traces", value: 15420, format: "number", change: 12.5 },
              { label: "Error Rate", value: 0.034, format: "percent", change: -15.7, lowerIsBetter: true },
              { label: "Avg Latency", value: 1240, format: "duration", change: -8.3, lowerIsBetter: true },
              { label: "Total Cost", value: 42.87, format: "currency", change: 5.2, lowerIsBetter: true },
            ],
          }}
        />
        <ErrorAnalysisCard
          data={{
            totalErrors: 47,
            timeRange: "Last 24 hours",
            errors: errorAnalysisData.errors.slice(0, 3),
            summary:
              "Rate limiting is the top issue with 23 occurrences. Web search timeouts and context length errors round out the top 3.",
          }}
        />
        <DataTableComponent
          data={{
            title: "Most Affected Endpoints",
            columns: [
              { key: "endpoint", label: "Endpoint", format: "text" },
              { key: "error_count", label: "Errors", format: "number" },
              { key: "avg_latency", label: "Avg Latency", format: "duration" },
              { key: "status", label: "Health", format: "badge" },
            ],
            rows: [
              { endpoint: "/api/analyze", error_count: 22, avg_latency: 5400, status: "warning" },
              { endpoint: "/api/chat", error_count: 15, avg_latency: 2100, status: "warning" },
              { endpoint: "/api/embed", error_count: 5, avg_latency: 890, status: "success" },
              { endpoint: "/api/rag", error_count: 3, avg_latency: 1650, status: "success" },
              { endpoint: "/api/summarize", error_count: 2, avg_latency: 3200, status: "success" },
            ],
            query: "SELECT name, count(*) FILTER (WHERE status='ERROR'), avg(duration) FROM traces GROUP BY name",
          }}
        />
      </div>
    ),
  },
];

export default function AIChatDemoPage() {
  const [activeScenario, setActiveScenario] = useState<string>("trace-summary");

  const current = scenarios.find((s) => s.id === activeScenario) ?? scenarios[0];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="flex-none border-b px-6 py-4">
        <h1 className="text-lg font-semibold">AI Chat Render Components Demo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Preview of rich render components that the AI assistant uses to display structured data in the chat panel.
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Scenario list */}
        <div className="w-72 flex-none border-r overflow-y-auto">
          <div className="p-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Demo Scenarios</span>
          </div>
          <div className="space-y-0.5 px-2 pb-4">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => setActiveScenario(scenario.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  activeScenario === scenario.id
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "hover:bg-muted/50 text-foreground/80"
                }`}
              >
                {scenario.title}
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto py-6 px-4">
            {/* Scenario description */}
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-1">{current.title}</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">{current.description}</p>
            </div>

            {/* Simulated chat */}
            <div className="space-y-4">
              {/* User message */}
              <div className="flex px-3">
                <div className="bg-muted/50 rounded px-3 py-2 border w-full">
                  <p className="text-sm">{current.userMessage}</p>
                </div>
              </div>

              {/* AI response with render components */}
              <div className="px-2">{current.components}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
