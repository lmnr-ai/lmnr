export type SpanType = 'LLM' | 'TOOL' | 'DEFAULT';

export interface SpanRow {
  name: string;
  type: SpanType;
  depth: number;
  dur: string;
}

/**
 * Real rows, lifted from the trace this repo generates
 * (kolbe-test / 53eb311e-6f23-009d-bf29-d10761ef5b63).
 */
export const SPANS: SpanRow[] = [
  { name: 'ai.generateText', type: 'DEFAULT', depth: 0, dur: '87.4s' },
  { name: 'llm gemini-3.7-flash', type: 'LLM', depth: 1, dur: '7.04s' },
  { name: 'list_files', type: 'TOOL', depth: 1, dur: '0.00s' },
  { name: 'fs.readdir', type: 'DEFAULT', depth: 2, dur: '0.00s' },
  { name: 'llm gemini-3.7-flash', type: 'LLM', depth: 1, dur: '12.43s' },
  { name: 'read_file', type: 'TOOL', depth: 1, dur: '0.00s' },
  { name: 'fs.readFile', type: 'DEFAULT', depth: 2, dur: '0.00s' },
  { name: 'llm gemini-3.7-flash', type: 'LLM', depth: 1, dur: '7.27s' },
  { name: 'grep', type: 'TOOL', depth: 1, dur: '0.01s' },
  { name: 'ripgrep.exec', type: 'DEFAULT', depth: 2, dur: '0.01s' },
  { name: 'llm gemini-3.7-flash', type: 'LLM', depth: 1, dur: '11.49s' },
  { name: 'edit_file', type: 'TOOL', depth: 1, dur: '0.00s' },
  { name: 'fs.writeFile', type: 'DEFAULT', depth: 2, dur: '0.00s' },
  { name: 'spawn_subagent', type: 'TOOL', depth: 1, dur: '23.44s' },
  { name: 'run_tests', type: 'TOOL', depth: 1, dur: '0.68s' },
  { name: 'shell.exec', type: 'DEFAULT', depth: 2, dur: '0.68s' },
];

export const TYPE_COLOR: Record<SpanType, string> = {
  LLM: '#a78bfa',
  TOOL: '#fbbf24',
  DEFAULT: '#6b7280',
};

/** Every span starts life looking like a default span. */
export const NEUTRAL = '#6b7280';
