use super::*;
use crate::db::spans::SpanType;
use crate::traces::spans::SpanAttributes;
use chrono::Utc;
use serde_json::{Value, json};
use std::sync::Mutex;

/// Marks every occurrence of `secret` as a `secret` mask over the text as
/// received (the fake does not re-serialize); `fail` makes the RPC error out.
struct FakeRedactor {
    fail: bool,
    calls: Mutex<Vec<Vec<String>>>,
}

impl FakeRedactor {
    fn new(fail: bool) -> Self {
        Self {
            fail,
            calls: Mutex::new(Vec::new()),
        }
    }
}

fn detect(text: String) -> MaskedText {
    let masks = text
        .match_indices("secret")
        .map(|(i, m)| PiiMask {
            start: i as u32,
            end: (i + m.len()) as u32,
            label: "secret".to_string(),
        })
        .collect();
    MaskedText { text, masks }
}

impl RedactTexts for FakeRedactor {
    async fn redact(&self, texts: Vec<String>) -> Result<Vec<MaskedText>> {
        self.calls.lock().unwrap().push(texts.clone());
        if self.fail {
            return Err(anyhow!("down"));
        }
        Ok(texts.into_iter().map(detect).collect())
    }
}

/// Returns the text as received with one mask past its end.
struct BadMasks;
impl RedactTexts for BadMasks {
    async fn redact(&self, texts: Vec<String>) -> Result<Vec<MaskedText>> {
        Ok(texts
            .into_iter()
            .map(|text| MaskedText {
                text,
                masks: vec![PiiMask {
                    start: 0,
                    end: 10_000,
                    label: "secret".to_string(),
                }],
            })
            .collect())
    }
}

fn span(project_id: Uuid, input: Option<Value>, output: Option<Value>) -> Span {
    Span {
        span_id: Uuid::new_v4(),
        project_id,
        trace_id: Uuid::new_v4(),
        parent_span_id: None,
        name: "s".into(),
        attributes: SpanAttributes::new(Default::default()),
        input,
        output,
        span_type: SpanType::Default,
        start_time: Utc::now(),
        end_time: Utc::now(),
        events: vec![],
        status: None,
        tags: None,
        size_bytes: 0,
    }
}

fn row(project_id: Uuid, content: &str) -> CHUniqueContent {
    CHUniqueContent {
        project_id,
        group_id: "g".to_string(),
        content_hash: [0u8; 32],
        content: content.to_string(),
    }
}

fn modes(project_id: Uuid, mode: Option<PiiMode>) -> HashMap<Uuid, Option<PiiMode>> {
    HashMap::from([(project_id, mode)])
}

#[tokio::test]
async fn off_project_is_untouched_without_rpc() {
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let mut rows = vec![row(p, "\"secret\"")];
    let redactor = FakeRedactor::new(false);
    redact_spans_in_place(
        &redactor,
        &mut spans,
        &mut rows,
        &mut [vec![]],
        &mut [vec![]],
        &[0],
        &modes(p, Some(PiiMode::Off)),
    )
    .await;
    assert!(redactor.calls.lock().unwrap().is_empty());
    assert_eq!(spans[0].input, Some(json!("secret")));
    assert_eq!(rows[0].content, "\"secret\"");
}

#[tokio::test]
async fn failed_settings_lookup_skips_the_project() {
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let redactor = FakeRedactor::new(false);
    redact_spans_in_place(
        &redactor,
        &mut spans,
        &mut [],
        &mut [vec![]],
        &mut [vec![]],
        &[0],
        &modes(p, None),
    )
    .await;
    assert!(redactor.calls.lock().unwrap().is_empty());
    assert_eq!(spans[0].input, Some(json!("secret")));
}

#[tokio::test]
async fn dual_is_ingested_like_redact_for_now() {
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("a secret")), None)];
    redact_spans_in_place(
        &FakeRedactor::new(false),
        &mut spans,
        &mut [],
        &mut [vec![]],
        &mut [vec![]],
        &[0],
        &modes(p, Some(PiiMode::Dual)),
    )
    .await;
    assert_eq!(spans[0].input, Some(json!("a [REDACTED_SECRET]")));
}

#[tokio::test]
async fn masks_are_spliced_into_every_buffer() {
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("a secret")), Some(json!("plain")))];
    let mut rows = vec![row(p, "{\"content\":\"secret\"}")];
    let mut tn_in = [vec!["\"secret msg\"".to_string()]];
    redact_spans_in_place(
        &FakeRedactor::new(false),
        &mut spans,
        &mut rows,
        &mut tn_in,
        &mut [vec![]],
        &[0],
        &modes(p, Some(PiiMode::Redact)),
    )
    .await;
    assert_eq!(spans[0].input, Some(json!("a [REDACTED_SECRET]")));
    assert_eq!(spans[0].output, Some(json!("plain")));
    assert_eq!(rows[0].content, "{\"content\":\"[REDACTED_SECRET]\"}");
    assert_eq!(tn_in[0][0], "\"[REDACTED_SECRET] msg\"");
}

#[tokio::test]
async fn span_text_is_sanitized_before_the_rpc() {
    let p = Uuid::new_v4();
    // U+0085 is stripped by `sanitize_string`; serde_json emits it raw.
    let mut spans = vec![span(p, Some(json!("a\u{85}b")), None)];
    let redactor = FakeRedactor::new(false);
    redact_spans_in_place(
        &redactor,
        &mut spans,
        &mut [],
        &mut [vec![]],
        &mut [vec![]],
        &[0],
        &modes(p, Some(PiiMode::Redact)),
    )
    .await;
    let calls = redactor.calls.lock().unwrap();
    assert_eq!(calls[0], vec!["\"ab\"".to_string()]);
}

#[tokio::test]
async fn rpc_failure_leaves_every_buffer_untouched() {
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let mut rows = vec![row(p, "\"secret\"")];
    let mut tn_in = [vec!["\"secret\"".to_string()]];
    redact_spans_in_place(
        &FakeRedactor::new(true),
        &mut spans,
        &mut rows,
        &mut tn_in,
        &mut [vec![]],
        &[0],
        &modes(p, Some(PiiMode::Redact)),
    )
    .await;
    assert_eq!(spans[0].input, Some(json!("secret")));
    assert_eq!(rows[0].content, "\"secret\"");
    assert_eq!(tn_in[0][0], "\"secret\"");
}

#[tokio::test]
async fn malformed_masks_leave_the_field_as_is() {
    // Never emit partially redacted text: a mask `apply_masks` refuses
    // leaves the raw buffer untouched, like an RPC failure would.
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let mut rows = vec![row(p, "\"secret\"")];
    redact_spans_in_place(
        &BadMasks,
        &mut spans,
        &mut rows,
        &mut [vec![]],
        &mut [vec![]],
        &[0],
        &modes(p, Some(PiiMode::Redact)),
    )
    .await;
    assert_eq!(spans[0].input, Some(json!("secret")));
    assert_eq!(rows[0].content, "\"secret\"");
}
