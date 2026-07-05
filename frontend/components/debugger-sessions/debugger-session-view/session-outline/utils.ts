// Anchor ids linking each outline row to its block in the timeline. Trace-scoped
// so identical ids don't collide across runs.
export const traceAnchorId = (traceId: string): string => `outline-trace-${traceId}`;
export const evalAnchorId = (evaluationId: string): string => `outline-eval-${evaluationId}`;
export const textAnchorId = (blockId: string): string => `outline-text-${blockId}`;
