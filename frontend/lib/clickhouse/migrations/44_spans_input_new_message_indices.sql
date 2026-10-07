ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS input_new_message_indices Array(UInt16) CODEC(ZSTD(3));
