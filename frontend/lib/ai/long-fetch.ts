import { Agent, fetch as undiciFetch } from "undici";

/** Upper bound for a single playground LLM call. Keep in sync with `maxDuration` on the chat route. */
export const PLAYGROUND_LLM_TIMEOUT_MS = 10 * 60 * 1000;

// Node's global fetch gives up after 300s without response headers, and non-streaming
// `generateText` gets no headers until the provider has finished the whole completion.
const longRunningAgent = new Agent({
  headersTimeout: PLAYGROUND_LLM_TIMEOUT_MS,
  bodyTimeout: PLAYGROUND_LLM_TIMEOUT_MS,
});

export const longRunningFetch: typeof globalThis.fetch = (input, init) => {
  // undici's fetch doesn't recognize the global `Request` class; providers pass URL strings anyway.
  if (typeof input !== "string" && !(input instanceof URL)) {
    return fetch(input, init);
  }
  return undiciFetch(input, {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: longRunningAgent,
  }) as unknown as Promise<Response>;
};
