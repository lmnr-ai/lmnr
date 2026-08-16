-- LAM-2115: `deduped_content` is a point-lookup table (dict source resolving
-- random content hashes); the default 8192-row granule makes each lookup
-- decompress a multi-MB neighborhood. Applies to NEW parts only — run
-- `OPTIMIZE TABLE deduped_content FINAL` out-of-band to rewrite history.
ALTER TABLE deduped_content MODIFY SETTING index_granularity = 256, max_compress_block_size = 65536;
