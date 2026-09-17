-- Record each step's token spend on the assistant turn it produced.
--
-- A run's totals ride on the queue message while the realtime worker drives its
-- steps, and a redelivery (worker crash, redeploy, ack timeout) brings back the
-- ORIGINAL bytes with the counters at zero. The conversation is already the
-- authority on how far the run got, so it becomes the authority on what the run
-- cost too: `prepare` sums these columns and lifts the resumed message back up,
-- instead of billing the workspace nothing for steps already paid for.
--
-- DEFAULT 0 on rows that are not assistant turns (prompts, tool results) and on
-- every row written before this migration. All three ALTERs are metadata-only,
-- so none of them rewrites the table.
ALTER TABLE signal_run_messages ADD COLUMN IF NOT EXISTS input_tokens UInt32 DEFAULT 0;
ALTER TABLE signal_run_messages ADD COLUMN IF NOT EXISTS cache_read_tokens UInt32 DEFAULT 0;
ALTER TABLE signal_run_messages ADD COLUMN IF NOT EXISTS output_tokens UInt32 DEFAULT 0;
