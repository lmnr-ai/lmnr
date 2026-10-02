/** Based on lmnr-02/frontend/components/landing/sections/flow-one/benchmark-data.ts,
 * with user-approved description F1 updates: flow-1 74.1%, Opus 5 84.8%,
 * Sonnet 5 77.3%, GPT-6 Sol 72.8%.
 * Legacy traces/$ here belong to the standalone spread; current pricing lives
 * in micro-23. Production exports must not import another worktree.
 */
export const GRAPH_MODELS = [
  {id: 'flow', name: 'flow-1', descF1: 74.1, tracesPerDollar: 756},
  {id: 'opus', name: 'Claude Opus 5', descF1: 84.8, tracesPerDollar: 7},
  {id: 'sonnet', name: 'Claude Sonnet 5', descF1: 77.3, tracesPerDollar: 11},
  {id: 'sol', name: 'GPT-6 Sol', descF1: 72.8, tracesPerDollar: 37},
  {id: 'luna', name: 'GPT-6 Luna', descF1: 63.8, tracesPerDollar: 632},
  {id: 'gemini', name: 'Gemini 3.8 Flash', descF1: 65.3, tracesPerDollar: 14},
] as const;
