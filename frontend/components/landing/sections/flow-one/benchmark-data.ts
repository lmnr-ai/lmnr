export interface BenchmarkModel {
  label: string;
  f1Score: number;
  tracesPerDollar: number;
  flow?: boolean;
}

const costToTracesPerDollar = (costPerRun: number) => Number((1 / costPerRun).toFixed(1));

// Full-benchmark F1 and median cost per trace. Gemini retains its previous
// measured cost because the new cost report does not include it.
export const BENCHMARK_MODELS: BenchmarkModel[] = [
  { label: "Flow-1", f1Score: 83.5, tracesPerDollar: costToTracesPerDollar(0.004), flow: true },
  { label: "Claude Opus 5", f1Score: 89, tracesPerDollar: costToTracesPerDollar(0.336) },
  { label: "Claude Sonnet 5", f1Score: 83.5, tracesPerDollar: costToTracesPerDollar(0.176) },
  { label: "GPT-6 Sol", f1Score: 81.6, tracesPerDollar: costToTracesPerDollar(0.079) },
  { label: "GPT-6 Luna", f1Score: 79.5, tracesPerDollar: costToTracesPerDollar(0.0045) },
  { label: "Gemini 3.8 Flash", f1Score: 69.9, tracesPerDollar: costToTracesPerDollar(0.094) },
];
