export interface BenchmarkModel {
  label: string;
  descF1: number;
  tracesPerDollar: number;
  flow?: boolean;
}

// Full-benchmark description F1 and measured traces per dollar. For models in
// the latest benchmark, cost is accumulated across all 224 traces under 100K
// tokens before converting to traces per dollar.
export const BENCHMARK_MODELS: BenchmarkModel[] = [
  { label: "flow-1", descF1: 73, tracesPerDollar: 886, flow: true },
  { label: "Claude Opus 5", descF1: 80.6, tracesPerDollar: 7 },
  { label: "Claude Sonnet 5", descF1: 76.9, tracesPerDollar: 12 },
  { label: "GPT-6 Sol", descF1: 72.8, tracesPerDollar: 38 },
  { label: "GPT-6 Luna", descF1: 63.8, tracesPerDollar: 632 },
  { label: "Gemini 3.8 Flash", descF1: 65.3, tracesPerDollar: 14 },
];
