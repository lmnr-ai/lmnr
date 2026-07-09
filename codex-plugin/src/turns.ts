import {
  extractTextFromContent,
  getLineType,
  getPayload,
  isInjectedUserText,
} from "./rollout.js";
import type { Json, Row } from "./types.js";

// ----------------- Turn model -----------------
export interface ToolCall {
  callId: string;
  name: string;
  input: Json;
  timestamp: Json; // envelope timestamp of the call row
  output?: Json;
  outputTimestamp?: Json;
}

/**
 * One model request: the contiguous run of model-output items (reasoning,
 * assistant message, tool calls) produced between tool executions.
 */
export interface Step {
  reasoningText: string;
  assistantText: string;
  toolCalls: ToolCall[];
  usage: Record<string, number> | null;
  timestamp: Json; // envelope timestamp of the first model item
  lastModelTimestamp: Json; // envelope timestamp of the last model item
}

export interface Turn {
  userText: string;
  userTimestamp: Json;
  model: string | null;
  steps: Step[];
  lastAssistantText: string;
  endTimestamp: Json; // task_complete timestamp, else last row timestamp
  completed: boolean; // saw task_complete or turn_aborted
  aborted: boolean;
  rows: Row[];
}

// Codex usage object -> gen_ai.usage.* attribute suffixes. Codex's
// input_tokens already includes cached_input_tokens (OpenAI convention),
// matching how the Laminar backend derives regular = input - cache_read.
const USAGE_KEY_MAP: Record<string, string> = {
  input_tokens: "input_tokens",
  cached_input_tokens: "cache_read_input_tokens",
  output_tokens: "output_tokens",
  reasoning_output_tokens: "reasoning_tokens",
};

export function mapUsage(usage: Json): Record<string, number> | null {
  if (typeof usage !== "object" || usage === null) {
    return null;
  }
  const details: Record<string, number> = {};
  for (const [src, dst] of Object.entries(USAGE_KEY_MAP)) {
    const v = usage[src];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      details[dst] = v;
    }
  }
  return Object.keys(details).length > 0 ? details : null;
}

// ----------------- Assembly -----------------
class TurnAssemblyState {
  currentTurn: Turn | null = null;
  currentStep: Step | null = null;
  stepClosed = false;
  model: string | null;

  constructor(initialModel: string | null) {
    this.model = initialModel;
  }
}

function newTurn(userText: string, timestamp: Json, row: Row): Turn {
  return {
    userText,
    userTimestamp: timestamp,
    model: null,
    steps: [],
    lastAssistantText: "",
    endTimestamp: null,
    completed: false,
    aborted: false,
    rows: [row],
  };
}

/** Get the current step, opening a new one when none is open or the last one closed. */
function openStep(state: TurnAssemblyState, timestamp: Json): Step | null {
  if (state.currentTurn === null) {
    return null;
  }
  if (state.currentStep === null || state.stepClosed) {
    state.currentStep = {
      reasoningText: "",
      assistantText: "",
      toolCalls: [],
      usage: null,
      timestamp,
      lastModelTimestamp: timestamp,
    };
    state.stepClosed = false;
    state.currentTurn.steps.push(state.currentStep);
  }
  state.currentStep.lastModelTimestamp = timestamp;
  return state.currentStep;
}

function closeTurn(state: TurnAssemblyState, turns: Turn[]): void {
  const turn = state.currentTurn;
  if (turn === null) {
    return;
  }
  turn.model = state.model;
  if (!turn.lastAssistantText) {
    const lastStepWithText = [...turn.steps].reverse().find((s) => s.assistantText);
    turn.lastAssistantText = lastStepWithText ? lastStepWithText.assistantText : "";
  }
  if (turn.endTimestamp === null) {
    const lastRow = turn.rows[turn.rows.length - 1];
    turn.endTimestamp = lastRow ? lastRow.timestamp : turn.userTimestamp;
  }
  turns.push(turn);
  state.currentTurn = null;
  state.currentStep = null;
  state.stepClosed = false;
}

/** function_call.arguments is a raw JSON string on the wire; parse with a string fallback. */
export function parseArguments(args: Json): Json {
  if (typeof args !== "string") {
    return args ?? {};
  }
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
}

function attachToolOutput(turn: Turn, callId: string, output: Json, timestamp: Json): void {
  // Search newest-first: outputs follow their calls, usually in the last step.
  for (let s = turn.steps.length - 1; s >= 0; s--) {
    const step = turn.steps[s]!;
    for (let t = step.toolCalls.length - 1; t >= 0; t--) {
      const call = step.toolCalls[t]!;
      if (call.callId === callId && call.output === undefined) {
        call.output = output;
        call.outputTimestamp = timestamp;
        return;
      }
    }
  }
}

function handleResponseItem(row: Row, payload: Row, state: TurnAssemblyState, turns: Turn[]): void {
  const itemType = payload.type;
  const ts = row.timestamp;

  switch (itemType) {
    case "message": {
      const role = payload.role;
      if (role === "user") {
        const text = extractTextFromContent(payload.content);
        // Injected context (<environment_context>, <user_instructions>) is not
        // a real prompt and must not start a turn.
        if (isInjectedUserText(text)) {
          if (state.currentTurn !== null) {
            state.currentTurn.rows.push(row);
          }
          return;
        }
        closeTurn(state, turns);
        state.currentTurn = newTurn(text, ts, row);
        return;
      }
      if (role === "assistant") {
        const step = openStep(state, ts);
        if (step !== null) {
          const text = extractTextFromContent(payload.content);
          step.assistantText = step.assistantText ? `${step.assistantText}\n${text}` : text;
          state.currentTurn!.rows.push(row);
        }
      }
      return;
    }
    case "reasoning": {
      const step = openStep(state, ts);
      if (step !== null) {
        // Prefer full reasoning content when present; fall back to summaries.
        const text = extractTextFromContent(payload.content) || extractTextFromContent(payload.summary);
        if (text) {
          step.reasoningText = step.reasoningText ? `${step.reasoningText}\n${text}` : text;
        }
        state.currentTurn!.rows.push(row);
      }
      return;
    }
    case "function_call": {
      const step = openStep(state, ts);
      if (step !== null) {
        step.toolCalls.push({
          callId: String(payload.call_id ?? payload.id ?? ""),
          name: String(payload.name ?? "unknown"),
          input: parseArguments(payload.arguments),
          timestamp: ts,
        });
        state.currentTurn!.rows.push(row);
      }
      return;
    }
    case "local_shell_call": {
      const step = openStep(state, ts);
      if (step !== null) {
        step.toolCalls.push({
          callId: String(payload.call_id ?? payload.id ?? ""),
          name: "shell",
          input: payload.action ?? {},
          timestamp: ts,
        });
        state.currentTurn!.rows.push(row);
      }
      return;
    }
    case "custom_tool_call": {
      const step = openStep(state, ts);
      if (step !== null) {
        step.toolCalls.push({
          callId: String(payload.call_id ?? payload.id ?? ""),
          name: String(payload.name ?? "unknown"),
          input: payload.input ?? {},
          timestamp: ts,
        });
        state.currentTurn!.rows.push(row);
      }
      return;
    }
    case "web_search_call": {
      const step = openStep(state, ts);
      if (step !== null) {
        step.toolCalls.push({
          callId: String(payload.id ?? ""),
          name: "web_search",
          input: payload.action ?? {},
          timestamp: ts,
        });
        state.currentTurn!.rows.push(row);
      }
      return;
    }
    case "function_call_output":
    case "custom_tool_call_output": {
      if (state.currentTurn !== null) {
        // `output` is either a plain string or a structured content array.
        attachToolOutput(state.currentTurn, String(payload.call_id ?? ""), payload.output ?? null, ts);
        state.currentTurn.rows.push(row);
        state.stepClosed = true;
      }
      return;
    }
    default:
      // Unknown response items are skipped (forward compatibility).
      return;
  }
}

function handleEventMsg(row: Row, payload: Row, state: TurnAssemblyState): void {
  const eventType = payload.type;
  switch (eventType) {
    case "token_count": {
      // Attach the per-request usage to the latest step of the current turn.
      const info = payload.info;
      const last = typeof info === "object" && info !== null ? info.last_token_usage : null;
      const usage = mapUsage(last);
      const turn = state.currentTurn;
      if (usage !== null && turn !== null && turn.steps.length > 0) {
        turn.steps[turn.steps.length - 1]!.usage = usage;
        turn.rows.push(row);
      }
      return;
    }
    // Codex serializes TurnComplete/TurnAborted as task_complete/turn_aborted.
    case "task_complete": {
      const turn = state.currentTurn;
      if (turn !== null) {
        turn.completed = true;
        turn.endTimestamp = row.timestamp;
        const lastMsg = payload.last_agent_message;
        if (typeof lastMsg === "string" && lastMsg && !turn.lastAssistantText) {
          turn.lastAssistantText = lastMsg;
        }
        turn.rows.push(row);
      }
      return;
    }
    case "turn_aborted": {
      const turn = state.currentTurn;
      if (turn !== null) {
        turn.completed = true;
        turn.aborted = true;
        turn.endTimestamp = row.timestamp;
        turn.rows.push(row);
      }
      return;
    }
    default:
      // user_message / agent_message / agent_reasoning duplicate response_item
      // content and are ignored; other events are irrelevant to tracing.
      return;
  }
}

export interface BuildTurnsResult {
  turns: Turn[];
  lastModel: string | null;
}

/**
 * Groups rollout rows into turns: a real (non-injected) user message opens a
 * turn; response items form steps; task_complete / turn_aborted closes timing.
 * `initialModel` carries the model across incremental batches (the
 * turn_context line may have landed in an earlier batch).
 */
export function buildTurns(rows: Row[], initialModel: string | null = null): BuildTurnsResult {
  const turns: Turn[] = [];
  const state = new TurnAssemblyState(initialModel);

  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      continue;
    }
    const lineType = getLineType(row);
    const payload = getPayload(row);

    switch (lineType) {
      case "turn_context": {
        const model = payload.model;
        if (typeof model === "string" && model) {
          state.model = model;
          if (state.currentTurn !== null) {
            state.currentTurn.model = model;
          }
        }
        break;
      }
      case "response_item":
        handleResponseItem(row, payload, state, turns);
        break;
      case "event_msg":
        handleEventMsg(row, payload, state);
        break;
      default:
        // session_meta is handled by the orchestrator; compacted / world_state
        // and unknown line types are skipped.
        break;
    }
  }

  closeTurn(state, turns);
  return { turns, lastModel: state.model };
}
