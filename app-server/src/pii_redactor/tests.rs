use super::*;
use crate::db::spans::SpanType;
use crate::traces::spans::SpanAttributes;
use chrono::Utc;
use serde_json::json;
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

fn modes(project_id: Uuid, mode: PiiMode) -> ProjectModes {
    HashMap::from([(project_id, mode)]).into()
}

/// The recordable view the processor hands to `redact_spans_in_place`.
fn refs(spans: &mut [Span]) -> Vec<&mut Span> {
    spans.iter_mut().collect()
}

fn secret_mask(start: u32, end: u32) -> PiiMask {
    PiiMask {
        start,
        end,
        label: "secret".to_string(),
    }
}

#[tokio::test]
async fn off_project_is_untouched_and_unchecked() {
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let mut rows = vec![row(p, "\"secret\"")];
    let redactor = FakeRedactor::new(false);
    let outcome = redact_spans_in_place(
        &redactor,
        &mut refs(&mut spans),
        &mut rows,
        &mut [vec![]],
        &mut [vec![]],
        &modes(p, PiiMode::Off),
    )
    .await;
    assert!(redactor.calls.lock().unwrap().is_empty());
    assert_eq!(outcome.verdict(0), &SpanVerdict::Off);
    assert!(!outcome.verdict(0).pii_checked());
    assert!(!rows[0].pii_checked);
    // Never attempted is not a failure: the row is still stamped present.
    assert!(!outcome.shared_row_failed(0));
    assert_eq!(spans[0].input, Some(json!("secret")));
}

#[tokio::test]
async fn redact_mode_splices_masks_into_raw_and_stamps_checked() {
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("a secret")), Some(json!("plain")))];
    let mut rows = vec![row(p, "{\"content\":\"secret\"}")];
    let mut tn_in = [vec!["\"secret msg\"".to_string()]];
    let outcome = redact_spans_in_place(
        &FakeRedactor::new(false),
        &mut refs(&mut spans),
        &mut rows,
        &mut tn_in,
        &mut [vec![]],
        &modes(p, PiiMode::Redact),
    )
    .await;
    // `redact` keeps no masks: the spliced text is the stored text.
    assert_eq!(outcome.verdict(0), &SpanVerdict::Redacted);
    assert!(outcome.verdict(0).pii_checked());
    assert_eq!(spans[0].input, Some(json!("a [REDACTED_SECRET]")));
    assert_eq!(spans[0].output, Some(json!("plain")));
    assert_eq!(rows[0].content, "{\"content\":\"[REDACTED_SECRET]\"}");
    assert!(rows[0].content_masks.is_empty());
    assert!(rows[0].pii_checked);
    assert_eq!(tn_in[0][0], "\"[REDACTED_SECRET] msg\"");
    assert!(outcome.is_indexable(0));
}

#[tokio::test]
async fn dual_mode_keeps_canonical_text_and_masks() {
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
        &mut refs(&mut spans),
        &mut rows,
        &mut tn_in,
        &mut [vec![], vec![]],
        &modes(p, PiiMode::Dual),
    )
    .await;

    // Every screened text is carried, masks or not, so the row stores the
    // canonical bytes the masks index.
    assert!(outcome.verdict(0).pii_checked());
    assert_eq!(
        outcome.verdict(0),
        &SpanVerdict::Masked {
            input: Some(MaskedText {
                text: "\"a secret\"".to_string(),
                masks: vec![secret_mask(3, 9)],
            }),
            output: Some(MaskedText {
                text: "\"plain\"".to_string(),
                masks: vec![],
            }),
        }
    );
    // The raw `Span` is left alone.
    assert_eq!(spans[0].input, Some(json!("a secret")));

    let SpanVerdict::Masked {
        input: Some(clean), ..
    } = outcome.verdict(1)
    else {
        panic!("checked dual span");
    };
    assert!(!clean.has_pii());

    assert_eq!(rows[0].content, "{\"content\":\"secret\"}");
    assert_eq!(rows[0].content_masks, vec![(12, 18, "secret".to_string())]);
    assert!(rows[0].pii_checked);
    assert!(rows[1].content_masks.is_empty());
    assert!(rows[1].pii_checked);

    // Search buffers only ever carry spliced text.
    assert_eq!(tn_in[0][0], "\"[REDACTED_SECRET] msg\"");
    assert!(outcome.is_indexable(0));

    // The index sees whole values with masks spliced; a span with nothing to
    // splice is handed back as-is (no clone), and the raw span is untouched.
    let view = outcome.index_view(0, &spans[0]);
    assert!(matches!(view, std::borrow::Cow::Owned(_)));
    assert_eq!(view.input, Some(json!("a [REDACTED_SECRET]")));
    assert_eq!(view.output, Some(json!("plain")));
    assert_eq!(spans[0].input, Some(json!("a secret")));
    assert!(matches!(
        outcome.index_view(1, &spans[1]),
        std::borrow::Cow::Borrowed(_)
    ));
}

#[tokio::test]
async fn dual_mode_stores_the_redactor_text_verbatim_not_resanitized() {
    // The redactor can emit chars `sanitize_string` strips (it unescapes a
    // `\u0085` in the input into a raw U+0085); re-sanitizing its output
    // would shift every later mask. The response is stored byte-for-byte.
    struct Emits85;
    impl RedactTexts for Emits85 {
        async fn redact(&self, texts: Vec<String>) -> Result<Vec<MaskedText>> {
            Ok(texts
                .into_iter()
                .map(|t| detect(t.replacen("secret", "\u{85}secret", 1)))
                .collect())
        }
    }
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let mut rows = vec![row(p, "\"secret\"")];
    let outcome = redact_spans_in_place(
        &Emits85,
        &mut refs(&mut spans),
        &mut rows,
        &mut [vec![]],
        &mut [vec![]],
        &modes(p, PiiMode::Dual),
    )
    .await;
    let SpanVerdict::Masked {
        input: Some(masked),
        ..
    } = outcome.verdict(0)
    else {
        panic!("checked dual span");
    };
    assert_eq!(masked.text, "\"\u{85}secret\"");
    assert_ne!(sanitize_string(&masked.text), masked.text);
    assert_eq!(masked.masks, vec![secret_mask(3, 9)]);
    assert_eq!(masked.redacted().unwrap(), "\"\u{85}[REDACTED_SECRET]\"");
    assert_eq!(rows[0].content, "\"\u{85}secret\"");
    assert_eq!(rows[0].content_masks, vec![(3, 9, "secret".to_string())]);
}

#[tokio::test]
async fn span_text_is_sanitized_before_the_rpc() {
    let p = Uuid::new_v4();
    // serde_json emits U+0085 raw; `sanitize_string` strips it.
    let mut spans = vec![span(p, Some(json!("a\u{85}b")), None)];
    let redactor = FakeRedactor::new(false);
    redact_spans_in_place(
        &redactor,
        &mut refs(&mut spans),
        &mut [],
        &mut [vec![]],
        &mut [vec![]],
        &modes(p, PiiMode::Dual),
    )
    .await;
    let sent = redactor.calls.lock().unwrap();
    assert_eq!(sent[0], vec!["\"ab\"".to_string()]);
}

#[tokio::test]
async fn rpc_failure_leaves_raw_unchecked_and_unstamped() {
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let mut rows = vec![row(p, "\"secret\"")];
    let outcome = redact_spans_in_place(
        &FakeRedactor::new(true),
        &mut refs(&mut spans),
        &mut rows,
        &mut [vec![]],
        &mut [vec![]],
        &modes(p, PiiMode::Dual),
    )
    .await;
    assert_eq!(
        outcome.verdict(0),
        &SpanVerdict::Failed {
            mode: PiiMode::Dual
        }
    );
    assert!(!outcome.verdict(0).pii_checked());
    assert!(!rows[0].pii_checked);
    assert!(rows[0].content_masks.is_empty());
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
        &mut refs(&mut spans),
        &mut [],
        &mut [vec![]],
        &mut [vec![]],
        &modes(p, PiiMode::Redact),
    )
    .await;
    assert_eq!(
        outcome.verdict(0),
        &SpanVerdict::Failed {
            mode: PiiMode::Redact
        }
    );
    assert!(outcome.is_indexable(0));
}

#[test]
fn without_redactor_only_off_and_redact_spans_stay_indexable() {
    let (off, redact, dual) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
    let spans = vec![
        span(off, Some(json!("secret")), None),
        span(redact, Some(json!("secret")), None),
        span(dual, Some(json!("secret")), None),
    ];
    let project_modes: ProjectModes = HashMap::from([
        (off, PiiMode::Off),
        (redact, PiiMode::Redact),
        (dual, PiiMode::Dual),
    ])
    .into();
    let outcome = PiiOutcome::without_redactor(spans.iter().map(|s| s.project_id), &project_modes);

    // `off` is never attempted, so it is not a failure: nothing to hide.
    assert_eq!(outcome.verdict(0), &SpanVerdict::Off);
    assert!(outcome.is_indexable(0));
    // Non-`off` spans all fail; only `dual` is kept out of the index.
    for (idx, mode, indexable) in [(1, PiiMode::Redact, true), (2, PiiMode::Dual, false)] {
        assert_eq!(
            outcome.verdict(idx),
            &SpanVerdict::Failed { mode },
            "span {idx}"
        );
        assert!(!outcome.verdict(idx).pii_checked(), "span {idx}");
        assert_eq!(outcome.is_indexable(idx), indexable, "span {idx}");
    }
    assert!(!outcome.shared_row_failed(0));

    // A span the batch never saw, and a project the modes never covered,
    // both fail closed.
    assert_eq!(
        outcome.verdict(99),
        &SpanVerdict::Failed {
            mode: PiiMode::Dual
        }
    );
    assert!(!outcome.is_indexable(99));
    assert_eq!(project_modes.get(&Uuid::new_v4()), PiiMode::Dual);
}

#[tokio::test]
async fn garbage_canonical_text_leaves_the_span_unchecked() {
    struct Garbage;
    impl RedactTexts for Garbage {
        async fn redact(&self, texts: Vec<String>) -> Result<Vec<MaskedText>> {
            Ok(texts
                .into_iter()
                .map(|_| MaskedText {
                    text: "not json".to_string(),
                    masks: vec![],
                })
                .collect())
        }
    }
    let p = Uuid::new_v4();
    for mode in [PiiMode::Dual, PiiMode::Redact] {
        let mut spans = vec![span(p, Some(json!("secret")), None)];
        let outcome = redact_spans_in_place(
            &Garbage,
            &mut refs(&mut spans),
            &mut [],
            &mut [vec![]],
            &mut [vec![]],
            &modes(p, mode),
        )
        .await;
        assert_eq!(outcome.verdict(0), &SpanVerdict::Failed { mode });
        assert_eq!(spans[0].input, Some(json!("secret")));
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
                masks: vec![secret_mask(0, 10_000)],
            })
            .collect())
    }
}

#[tokio::test]
async fn malformed_masks_fail_closed() {
    // `redact` mode must not store the raw text as if it were safe, and the
    // shared row must not be stamped.
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let mut rows = vec![row(p, "\"secret\"")];
    let mut tn_in = [vec!["\"secret\"".to_string()]];
    let outcome = redact_spans_in_place(
        &BadMasks,
        &mut refs(&mut spans),
        &mut rows,
        &mut tn_in,
        &mut [vec![]],
        &modes(p, PiiMode::Redact),
    )
    .await;
    assert!(!outcome.verdict(0).pii_checked());
    assert_eq!(spans[0].input, Some(json!("secret")));
    assert!(!rows[0].pii_checked);
    assert!(outcome.shared_row_failed(0));
    assert_eq!(tn_in[0][0], "\"secret\"", "buffer left as-is, span failed");
    assert!(outcome.is_indexable(0), "redact-mode failures still index");
}

#[tokio::test]
async fn dual_mode_rejects_malformed_masks_before_storing_them() {
    // The ClickHouse splice trusts stored masks, so a range `apply_masks`
    // would refuse must never reach a `pii_checked` row.
    let p = Uuid::new_v4();
    let mut spans = vec![span(p, Some(json!("secret")), None)];
    let mut rows = vec![row(p, "\"secret\"")];
    let outcome = redact_spans_in_place(
        &BadMasks,
        &mut refs(&mut spans),
        &mut rows,
        &mut [vec![]],
        &mut [vec![]],
        &modes(p, PiiMode::Dual),
    )
    .await;
    assert_eq!(
        outcome.verdict(0),
        &SpanVerdict::Failed {
            mode: PiiMode::Dual
        },
        "no masks handed to the CH row"
    );
    assert!(!rows[0].pii_checked);
    assert!(rows[0].content_masks.is_empty());
    assert!(outcome.shared_row_failed(0));
    assert!(!outcome.is_indexable(0), "dual-mode failures hold raw text");
}
