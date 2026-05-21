-- Drop the credential-less `llm_messages_dict` that migration 43 creates.
-- The dict is re-created with env-driven CLICKHOUSE source credentials by
-- `ensureLlmMessagesDict` in `frontend/instrumentation.ts`, which runs right
-- after the migrator finishes. This drop runs unconditionally so already-
-- applied envs (where 43 produced the broken dict) get healed on next boot.
-- The `spans_v0` view's `dictGetOrDefault('llm_messages_dict', ...)` lookups
-- are resolved lazily by CH at query time, so the brief window between this
-- drop and the startup-hook re-create is invisible (no HTTP traffic yet).
DROP DICTIONARY IF EXISTS llm_messages_dict;
