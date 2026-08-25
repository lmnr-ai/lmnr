//! Record body encoding for the stream transport.
//!
//! Bodies are zstd-compressed and stamped with an `lmnr.encoding = zstd`
//! application property. The reader dispatches on the property: absent means
//! plain JSON, so records published by older builds — and queue-fallback
//! payloads, which never carry the property — decode unchanged. No transition
//! state, no backfill; the only deploy-order rule is reader-before-(or with-)
//! producer, which a same-image rollout satisfies.
//!
//! Span-batch JSON compresses ~5x at zstd level 3, which shrinks every
//! downstream stage at once: the wire frame, the client codec buffer's
//! high-water mark (the prod OOM mechanism — the buffer permanently keeps the
//! largest frame it ever carried), broker disk/replication, and effective
//! retention runway.

use std::borrow::Cow;

use anyhow::{Context, Result, anyhow};

/// Application property carrying the body encoding. Absent = plain JSON.
pub const ENCODING_PROPERTY: &str = "lmnr.encoding";
pub const ENCODING_ZSTD: &str = "zstd";

/// zstd's own default. Higher levels buy little on JSON and cost publish CPU.
const ZSTD_LEVEL: i32 = 3;

pub fn compress(body: &[u8]) -> Result<Vec<u8>> {
    zstd::stream::encode_all(body, ZSTD_LEVEL).context("Failed to zstd-compress stream record body")
}

/// Decode a record body per its `lmnr.encoding` property value.
///
/// Borrows the plain-JSON case: most historical records and all queue-era
/// payloads skip the copy entirely.
pub fn decode<'a>(body: &'a [u8], encoding: Option<&str>) -> Result<Cow<'a, [u8]>> {
    match encoding {
        None => Ok(Cow::Borrowed(body)),
        Some(ENCODING_ZSTD) => zstd::stream::decode_all(body)
            .map(Cow::Owned)
            .context("Failed to zstd-decompress stream record body"),
        Some(other) => Err(anyhow!("Unknown stream record encoding '{}'", other)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let body = br#"[{"span_id":"abc","input":"hello world"}]"#;
        let compressed = compress(body).unwrap();
        let decoded = decode(&compressed, Some(ENCODING_ZSTD)).unwrap();
        assert_eq!(decoded.as_ref(), body);
    }

    #[test]
    fn absent_property_is_passthrough() {
        let body = br#"[{"plain":"json"}]"#;
        let decoded = decode(body, None).unwrap();
        assert_eq!(decoded.as_ref(), body);
        assert!(
            matches!(decoded, Cow::Borrowed(_)),
            "plain path must not copy"
        );
    }

    #[test]
    fn unknown_encoding_errors() {
        assert!(decode(b"anything", Some("lz4")).is_err());
    }

    #[test]
    fn corrupt_body_errors() {
        assert!(decode(b"not zstd at all", Some(ENCODING_ZSTD)).is_err());
    }

    /// Pins the reason compression is here: span-shaped JSON must shrink
    /// several-fold, or the buffer/disk win this module exists for is gone.
    #[test]
    fn span_like_json_compresses_well() {
        let payload: Vec<serde_json::Value> = (0..50)
            .map(|i| {
                serde_json::json!({
                    "span_id": format!("{:032x}", i),
                    "trace_id": format!("{:032x}", i * 7),
                    "name": "gen_ai.chat",
                    "attributes": {"gen_ai.usage.input_tokens": i, "lmnr.span.path": ["agent", "llm"]},
                    "input": format!("analyze the following code, step {} ", i).repeat(40),
                })
            })
            .collect();
        let body = serde_json::to_vec(&payload).unwrap();
        let compressed = compress(&body).unwrap();
        assert!(
            compressed.len() * 4 < body.len(),
            "expected >4x on span-like JSON, got {} -> {}",
            body.len(),
            compressed.len()
        );
    }
}
