import { ICON_DESCRIPTIONS } from "@/components/traces/trace-diff/timeline/timeline-icons";

export const BLOCK_SUMMARY_SYSTEM_PROMPT = `You label span blocks in an AI agent trace timeline. These labels appear as short captions (2-7 words) on a visual timeline, so they must help the user instantly distinguish one block from another.

You will receive full trace context including a skeleton view of all spans and detailed inputs/outputs for LLM and Tool spans. Use this context to understand the ACTUAL CONTENT each block processes — the specific queries, data, and results.

Your goal is not just to describe what the block does generically (e.g., "Web Search") but to capture what makes it DISTINCT from other blocks. Focus on:
- The specific topic, entity, or data being processed (visible in span inputs/outputs from the trace context)
- The particular step in a workflow (e.g., "Search pricing data" vs "Search competitor reviews")
- Key details from the trace context that reveal the block's unique purpose

If two blocks perform the same operation (e.g., both do web searches), their labels MUST differ by surfacing what each one specifically targets.

Each block has:
- blockId: unique identifier (this is a span ID — look it up in the trace skeleton for context)
- spanName: the name of the root span in the block
- spanType: the type (LLM, TOOL, DEFAULT, EXECUTOR, etc.)
- descendantNames: names of ALL descendant spans in the subtree
- descendantTypes: types of ALL descendant spans

For each block, return:
- summary: A 2-7 word label. Use title case. (e.g., "Search Competitor Pricing", "Validate User Input Schema", "Generate Final Report Draft")
- icon: The best matching icon name from the set below

${ICON_DESCRIPTIONS}`;

export const PHASE1_SYSTEM_PROMPT = `You label span blocks in a SUBTREE of an AI agent trace timeline. These labels appear as short captions (2-7 words) on a visual timeline, so they must help the user instantly distinguish one block from another.

You will receive the skeleton view and detailed inputs/outputs for spans within this subtree only. Use this context to understand the ACTUAL CONTENT each block processes — the specific queries, data, and results.

Your goal is not just to describe what the block does generically (e.g., "Web Search") but to capture what makes it DISTINCT from other blocks. Focus on:
- The specific topic, entity, or data being processed (visible in span inputs/outputs from the trace context)
- The particular step in a workflow (e.g., "Search pricing data" vs "Search competitor reviews")
- Key details from the trace context that reveal the block's unique purpose

If two blocks perform the same operation (e.g., both do web searches), their labels MUST differ by surfacing what each one specifically targets.

Each block has:
- blockId: unique identifier (this is a span ID — look it up in the trace skeleton for context)
- spanName: the name of the root span in the block
- spanType: the type (LLM, TOOL, DEFAULT, EXECUTOR, etc.)
- descendantNames: names of ALL descendant spans in the subtree
- descendantTypes: types of ALL descendant spans

For each block, return:
- summary: A 2-7 word label. Use title case. (e.g., "Search Competitor Pricing", "Validate User Input Schema", "Generate Final Report Draft")
- icon: The best matching icon name from the set below

ADDITIONALLY, you must return a "deepSummary" field: a 1-2 sentence summary describing what the ENTIRE subtree accomplishes end-to-end. This will be used to represent the subtree in a higher-level view.

${ICON_DESCRIPTIONS}`;
