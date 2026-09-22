export interface BenchmarkModel {
  label: string;
  intelligence: number;
  tracesPerDollar: number;
  flow?: boolean;
}

const costToTracesPerDollar = (costPerRun: number) => Number((1 / costPerRun).toFixed(1));

// F1 evaluation score and measured cost for a 16k-character trace.
export const BENCHMARK_MODELS: BenchmarkModel[] = [
  { label: "Flow-1", intelligence: 81.9, tracesPerDollar: costToTracesPerDollar(0.0042), flow: true },
  { label: "Claude Opus 5", intelligence: 89, tracesPerDollar: costToTracesPerDollar(0.166) },
  { label: "Claude Sonnet 5", intelligence: 83.5, tracesPerDollar: costToTracesPerDollar(0.109) },
  { label: "GPT-5.6 Sol", intelligence: 81, tracesPerDollar: costToTracesPerDollar(0.162) },
  { label: "GPT-5.6 Luna", intelligence: 80, tracesPerDollar: costToTracesPerDollar(0.0086) },
  { label: "Gemini 3.8 Flash", intelligence: 69.9, tracesPerDollar: costToTracesPerDollar(0.094) },
];
