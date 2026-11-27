-- Output of remote eval runs' orchestrators (`lmnr-cli eval run --remote`, LAM-2492):
-- the CLI follows a run by polling `seq`. Its writers (lmnr-cli, then the shell) take turns, so a
-- retried batch replaces itself. Column order must match `ch::evaluation_logs::CHEvaluationLog`.
CREATE TABLE IF NOT EXISTS evaluation_logs
(
    project_id UUID,
    upload_id UUID,
    seq UInt64,
    time DateTime64(9, 'UTC'),
    text String CODEC(ZSTD(3)),
    exit_code Nullable(Int32)
)
ENGINE = ReplacingMergeTree
ORDER BY (project_id, upload_id, seq);
