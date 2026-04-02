CREATE TABLE IF NOT EXISTS signal_run_messages_v2
(
    project_id UUID,
    run_id UUID,
    time DateTime64(9, 'UTC'),
    message String
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(time)
ORDER BY (project_id, run_id, time)
TTL time + INTERVAL 7 DAY
SETTINGS index_granularity = 8192;

INSERT INTO signal_run_messages_v2(
    project_id,
    run_id,
    time,
    message
)
SELECT project_id, run_id, time, message
FROM signal_run_messages
WHERE time >= now() - INTERVAL 7 DAY;

DROP TABLE IF EXISTS signal_run_messages;
