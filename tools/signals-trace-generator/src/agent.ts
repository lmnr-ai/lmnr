import { ToolLoopAgent, tool, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { list_files, read_file, grep, edit_file, run_tests } from './tools.js';

const MODEL = process.env.MODEL ?? 'gemini-3.7-flash';

const telemetry = { isEnabled: true };

const thinking = {
  google: {
    thinkingConfig: { includeThoughts: true, thinkingLevel: 'high' },
  },
} as const;

const SUBAGENT_INSTRUCTIONS = `You are a focused test-writing subagent working inside a
TypeScript Express API project. You are given one narrow task by a lead engineer.

Work in exactly four steps. Do not take any others:
1. read_file the existing test file, so your tests match the established style
   (vitest + supertest, describe/it blocks).
2. read_file the route file you are testing, so you assert against its real
   response shape.
3. edit_file the complete test file back. Update any existing test the change
   invalidated, and add new ones for the behaviour you were asked to cover. Add
   at most four new tests — cover the happy path and the main error case, not
   every permutation.
4. Reply with a two-sentence summary of what you added.

Never read the same file twice; you already have its contents. Never run the
test suite — the lead engineer does that.`;

const testWriter = new ToolLoopAgent({
  model: google(MODEL),
  instructions: SUBAGENT_INSTRUCTIONS,
  tools: { read_file, grep, edit_file },
  stopWhen: stepCountIs(5),
  providerOptions: thinking,
  experimental_telemetry: telemetry,
});

const spawn_subagent = tool({
  description:
    'Delegate a self-contained task to a specialist subagent. Use this for writing tests. ' +
    'Give it a complete, standalone brief — it cannot see your conversation.',
  inputSchema: z.object({
    role: z.enum(['test-writer']).describe('Which specialist to spawn'),
    task: z
      .string()
      .describe('A complete, standalone brief. Name the files involved and what to cover.'),
  }),
  execute: async ({ task }) => {
    const result = await testWriter.generate({ prompt: task });
    return { report: result.text };
  },
});

const LEAD_INSTRUCTIONS = `You are a senior software engineer working in a TypeScript
Express API project. You act autonomously: you explore the codebase, make the change,
and verify it. You never ask the user follow-up questions.

The project layout:
- src/app.ts        — express app wiring
- src/db.ts         — data access layer
- src/routes/*.ts   — route handlers
- tests/*.test.ts   — vitest + supertest tests

Work through exactly these steps, one tool call each. Do not take any others:
1. list_files on "." to orient yourself.
2. read_file the list endpoint that does not paginate yet.
3. grep once for the shared pagination helper this codebase already uses, so your
   change matches the house style instead of inventing a new one.
4. read_file that helper.
5. edit_file the route file with the complete new contents, using the helper.
6. spawn_subagent with role "test-writer" to write the tests. You MUST delegate this
   rather than writing tests yourself — the subagent is the team's test specialist.
   Give it a full standalone brief naming the files and the cases to cover.
7. run_tests once, after the subagent reports back.
8. Reply with a short summary of what changed.

Efficiency rules, which matter as much as correctness:
- Never read the same file twice. Its contents are already in your context.
- Call run_tests exactly once. Do not re-run it to double-check.
- If the edit needs a change to the data-access file too, fold it into step 5 by
  calling edit_file a second time there, then continue. Nothing else.

Conventions in this codebase:
- Pagination is offset-based: accept limit and offset query params.
- Default limit is 50, maximum limit is 100.
- Paginated responses return { data, pagination: { total, limit, offset } }.
- Reject invalid pagination params with a 400 and a descriptive error message.`;

export const leadAgent = new ToolLoopAgent({
  model: google(MODEL),
  instructions: LEAD_INSTRUCTIONS,
  tools: { list_files, read_file, grep, edit_file, spawn_subagent, run_tests },
  stopWhen: stepCountIs(10),
  providerOptions: thinking,
  experimental_telemetry: telemetry,
});
