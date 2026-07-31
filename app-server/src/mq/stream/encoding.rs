//! Stream record body compression.
//!
//! Every byte published to a stream is written to `replication_factor` disks
//! and crosses as many network links, and retention is byte-budgeted — so
//! compressing the JSON body (~5x on span-export batches) multiplies burst
//! runway and divides broker network/disk work by the same factor. The broker
//! never looks inside the body, so this is invisible to it.
//!
//! The encoding travels as a message application property
//! (`lmnr.encoding = zstd`), and the reader decodes by property — an absent
//! property is a plain-JSON record. That makes the two sides independently
//! deployable: mixed compressed/uncompressed records in one partition are
//! fine, and flipping the producer-side env gate needs no coordination.

use std::borrow::Cow;

use rabbitmq_stream_client::types::Message;

/// Application property carrying the body encoding. Absent = plain JSON.
pub(crate) const ENCODING_PROPERTY: &str = "lmnr.encoding";
/// The only encoding currently produced.
pub(crate) const ZSTD_ENCODING: &str = "zstd";

/// zstd's own default (level 3): ~300-400 MB/s per core to compress, ~1 GB/s
/// to decompress — far above our peak ingest rate, so CPU is a non-issue and
/// the better ratio of 3 vs 1 is free.
const ZSTD_LEVEL: i32 = 3;

pub(crate) fn compress(body: &[u8]) -> std::io::Result<Vec<u8>> {
    zstd::stream::encode_all(body, ZSTD_LEVEL)
}

/// Resolve a record's body according to its encoding property.
///
/// Borrowed passthrough for plain records (the common case for legacy
/// in-flight data), owned buffer for compressed ones. An unknown encoding or a
/// corrupt compressed body is an `Err` — the record can't be parsed on retry
/// either, so the caller treats it like any other undecodable record.
pub(crate) fn decode_body<'a>(message: &Message, data: &'a [u8]) -> Result<Cow<'a, [u8]>, String> {
    match encoding_of(message) {
        None => Ok(Cow::Borrowed(data)),
        Some(encoding) if encoding == ZSTD_ENCODING => zstd::stream::decode_all(data)
            .map(Cow::Owned)
            .map_err(|e| format!("zstd decompression failed: {e}")),
        Some(other) => Err(format!("unknown body encoding '{other}'")),
    }
}

fn encoding_of(message: &Message) -> Option<String> {
    message
        .application_properties()
        .and_then(|props| props.get(ENCODING_PROPERTY))
        .and_then(|value| String::try_from(value.clone()).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message_with_encoding(body: Vec<u8>, encoding: Option<&str>) -> Message {
        let builder = Message::builder().body(body);
        match encoding {
            Some(encoding) => builder
                .application_properties()
                .insert(ENCODING_PROPERTY, encoding)
                .message_builder()
                .build(),
            None => builder.build(),
        }
    }

    #[test]
    fn compressed_body_round_trips() {
        let payload = br#"{"spans":[{"name":"llm_call","attributes":{"gen_ai.system":"openai"}}]}"#;
        let compressed = compress(payload).unwrap();

        let message = message_with_encoding(compressed.clone(), Some(ZSTD_ENCODING));
        let decoded = decode_body(&message, &compressed).unwrap();
        assert_eq!(decoded.as_ref(), payload);
    }

    /// A record without the property must pass through untouched — that's what
    /// keeps legacy in-flight records (and a disabled producer gate) readable
    /// with zero coordination.
    #[test]
    fn absent_encoding_is_passthrough() {
        let payload = b"{\"plain\":true}";
        let message = message_with_encoding(payload.to_vec(), None);

        let decoded = decode_body(&message, payload).unwrap();
        assert!(matches!(decoded, Cow::Borrowed(_)));
        assert_eq!(decoded.as_ref(), payload);
    }

    /// An unknown encoding must be an error, not a passthrough: feeding a
    /// compressed body to serde_json would produce a confusing parse error and
    /// hide the real cause.
    #[test]
    fn unknown_encoding_is_an_error() {
        let message = message_with_encoding(b"x".to_vec(), Some("lz4"));
        let err = decode_body(&message, b"x").unwrap_err();
        assert!(err.contains("lz4"), "error should name the encoding: {err}");
    }

    #[test]
    fn corrupt_compressed_body_is_an_error() {
        let message = message_with_encoding(b"not zstd".to_vec(), Some(ZSTD_ENCODING));
        assert!(decode_body(&message, b"not zstd").is_err());
    }

    /// Sanity-pin the reason this module exists: repetitive span-export JSON
    /// compresses well. Not a precise ratio assertion (zstd version dependent),
    /// just "meaningfully smaller".
    #[test]
    fn span_like_json_compresses() {
        let span = r#"{"trace_id":"0198c0de-aaaa-bbbb-cccc-ddddeeeeffff","name":"gen_ai.chat","span_type":"LLM","attributes":{"gen_ai.usage.input_tokens":1024,"gen_ai.usage.output_tokens":256,"gen_ai.request.model":"gpt-5.2"},"input":"Summarize the following document about RabbitMQ streams and their retention semantics."}"#;
        let batch = format!("[{}]", vec![span; 32].join(","));

        let compressed = compress(batch.as_bytes()).unwrap();
        assert!(
            compressed.len() * 4 < batch.len(),
            "expected >4x on repetitive JSON, got {} -> {}",
            batch.len(),
            compressed.len()
        );
    }
}
