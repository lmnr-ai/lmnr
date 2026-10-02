/** Frozen from lmnr-02/frontend/components/landing/sections/flow-one/benchmark-data.ts.
 * Full-benchmark description F1 (%) and measured traces/$, rendered traces <16K
 * tokens. Keep this portable: production exports must not import another worktree.
 */
export const GRAPH_MODELS = [
  {id: 'flow', name: 'flow-1', descF1: 73, tracesPerDollar: 756},
  {id: 'opus', name: 'Claude Opus 5', descF1: 80.6, tracesPerDollar: 7},
  {id: 'sonnet', name: 'Claude Sonnet 5', descF1: 76.9, tracesPerDollar: 11},
  {id: 'sol', name: 'GPT-6 Sol', descF1: 71.3, tracesPerDollar: 37},
  {id: 'luna', name: 'GPT-6 Luna', descF1: 63.8, tracesPerDollar: 632},
  {id: 'gemini', name: 'Gemini 3.8 Flash', descF1: 65.3, tracesPerDollar: 14},
] as const;
