-- LAM-2115: `deduped_content` / `llm_messages` are point-lookup tables (dict
-- sources resolving random content hashes), but the default 8192-row granule
-- means each ~1KB lookup decompresses a ~8MB neighborhood — the read
-- amplification behind dict update-queue timeouts. Applies to NEW parts only;
-- existing parts keep 8192 until merged. Run `OPTIMIZE TABLE <t> FINAL`
-- out-of-band to rewrite history (not here: unbounded runtime on large
-- deployments would fail the boot-time migration).
ALTER TABLE deduped_content MODIFY SETTING index_granularity = 256, max_compress_block_size = 65536;
ALTER TABLE llm_messages MODIFY SETTING index_granularity = 256, max_compress_block_size = 65536;
