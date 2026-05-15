ALTER TABLE spans
    MODIFY COLUMN input_new_message_indices Array(UInt16)
        DEFAULT arrayMap(x -> toUInt16(x - 1), arrayEnumerate(input_message_hashes))
        CODEC(ZSTD(3));
