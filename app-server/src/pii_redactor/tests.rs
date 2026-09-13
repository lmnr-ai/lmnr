use super::*;
use crate::db::spans::SpanType;
use crate::traces::spans::SpanAttributes;
use chrono::Utc;
use serde_json::json;
use std::sync::Mutex;

/// Replaces every occurrence of `secret` with a placeholder; `fail`
/// makes the RPC error out.
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

impl RedactTexts for FakeRedactor {
    async fn redact(&self, texts: Vec<String>) -> Result<Vec<String>> {
        self.calls.lock().unwrap().push(texts.clone());
        if self.fail {
            return Err(anyhow!("down"));
        }
        Ok(texts
            .into_iter()
            .map(|t| t.replace("secret", "[REDACTED_SECRET]"))
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
    CHUniqueContent::new(project_id, "g".to_string(), [0u8; 32], content.to_string())
}

fn modes(project_id: Uuid, mode: Option<PiiMode>) -> HashMap<Uuid, Option<PiiMode>> {
    HashMap::from([(project_id, mode)])
}

#[tokio::test]
async fn off_project_is_untouched_and_unchecked() {
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let mut rows = vec![row(p, "\"secret\"")];
    let redactor = FakeRedactor::new(false);
    let outcome = redact_spans_in_place(
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
    assert!(!outcome.span(0).checked);
    assert!(!rows[0].pii_checked);
    // Never attempted is not a failure: the row is still stamped present.
    assert!(!outcome.shared_row_failed(0));
    assert_eq!(spans[0].input, Some(json!("secret")));
}

#[tokio::test]
async fn redact_mode_overwrites_raw_and_stamps_checked() {
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("a secret")), Some(json!("plain")))];
    let mut rows = vec![row(p, "{\"content\":\"secret\"}")];
    let mut tn_in = [vec!["\"secret msg\"".to_string()]];
    let outcome = redact_spans_in_place(
        &FakeRedactor::new(false),
        &mut spans,
        &mut rows,
        &mut tn_in,
        &mut [vec![]],
        &[0],
        &modes(p, Some(PiiMode::Redact)),
    )
    .await;
    let verdict = outcome.span(0);
    assert!(verdict.checked);
    assert_eq!(verdict.input_redacted, None);
    assert_eq!(spans[0].input, Some(json!("a [REDACTED_SECRET]")));
    assert_eq!(spans[0].output, Some(json!("plain")));
    assert_eq!(rows[0].content, "{\"content\":\"[REDACTED_SECRET]\"}");
    assert_eq!(rows[0].content_redacted, "");
    assert!(rows[0].pii_checked);
    assert_eq!(tn_in[0][0], "\"[REDACTED_SECRET] msg\"");
    assert!(outcome.is_indexable(0));
}

#[tokio::test]
async fn dual_mode_keeps_raw_and_fills_sparse_copies() {
    let p = Uuid::new_v4();
    let mut spans = vec![
        span(p, Some(json!("a secret")), Some(json!("plain"))),
        span(p, Some(json!("nothing here")), None),
    ];
    let mut rows = vec![
        row(p, "{\"content\":\"secret\"}"),
        row(p, "{\"content\":\"ok\"}"),
    ];
    let mut tn_in = [vec!["\"secret msg\"".to_string()], vec![]];
    let outcome = redact_spans_in_place(
        &FakeRedactor::new(false),
        &mut spans,
        &mut rows,
        &mut tn_in,
        &mut [vec![], vec![]],
        &[0, 1],
        &modes(p, Some(PiiMode::Dual)),
    )
    .await;

    let hit = outcome.span(0);
    assert!(hit.checked);
    assert_eq!(
        hit.input_redacted.as_deref(),
        Some("\"a [REDACTED_SECRET]\"")
    );
    assert_eq!(hit.output_redacted, None);
    assert_eq!(spans[0].input, Some(json!("a secret")));

    let clean = outcome.span(1);
    assert!(clean.checked);
    assert_eq!(clean.input_redacted, None);

    assert_eq!(rows[0].content, "{\"content\":\"secret\"}");
    assert_eq!(
        rows[0].content_redacted,
        "{\"content\":\"[REDACTED_SECRET]\"}"
    );
    assert!(rows[0].pii_checked);
    assert_eq!(rows[1].content_redacted, "");
    assert!(rows[1].pii_checked);

    // Search buffers only ever carry redacted text.
    assert_eq!(tn_in[0][0], "\"[REDACTED_SECRET] msg\"");
    assert!(outcome.is_indexable(0));
}

#[tokio::test]
async fn rpc_failure_leaves_raw_unchecked_and_unstamped() {
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let mut rows = vec![row(p, "\"secret\"")];
    let outcome = redact_spans_in_place(
        &FakeRedactor::new(true),
        &mut spans,
        &mut rows,
        &mut [vec![]],
        &mut [vec![]],
        &[0],
        &modes(p, Some(PiiMode::Dual)),
    )
    .await;
    assert!(!outcome.span(0).checked);
    assert!(!rows[0].pii_checked);
    assert!(outcome.shared_row_failed(0));
    assert_eq!(spans[0].input, Some(json!("secret")));
    assert!(!outcome.is_indexable(0));
}

#[tokio::test]
async fn failed_redact_mode_span_stays_indexable() {
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let outcome = redact_spans_in_place(
        &FakeRedactor::new(true),
        &mut spans,
        &mut [],
        &mut [vec![]],
        &mut [vec![]],
        &[0],
        &modes(p, Some(PiiMode::Redact)),
    )
    .await;
    assert!(!outcome.span(0).checked);
    assert!(outcome.is_indexable(0));
}

#[tokio::test]
async fn unknown_mode_is_failed_without_rpc() {
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let mut rows = vec![row(p, "\"secret\"")];
    let redactor = FakeRedactor::new(false);
    let outcome = redact_spans_in_place(
        &redactor,
        &mut spans,
        &mut rows,
        &mut [vec![]],
        &mut [vec![]],
        &[0],
        &modes(p, None),
    )
    .await;
    assert!(redactor.calls.lock().unwrap().is_empty());
    assert!(!outcome.span(0).checked);
    assert!(!rows[0].pii_checked);
    assert!(outcome.shared_row_failed(0));
}

#[tokio::test]
async fn parse_failure_after_a_clean_check_leaves_the_span_unchecked() {
    struct Garbage;
    impl RedactTexts for Garbage {
        async fn redact(&self, texts: Vec<String>) -> Result<Vec<String>> {
            Ok(texts.into_iter().map(|_| "not json".to_string()).collect())
        }
    }
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let outcome = redact_spans_in_place(
        &Garbage,
        &mut spans,
        &mut [],
        &mut [vec![]],
        &mut [vec![]],
        &[0],
        &modes(p, Some(PiiMode::Dual)),
    )
    .await;
    assert!(!outcome.span(0).checked);
    assert!(!outcome.is_indexable(0));
    assert_eq!(spans[0].input, Some(json!("secret")));
}
