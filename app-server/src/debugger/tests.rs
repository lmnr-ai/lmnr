use super::*;

/// Cross-language hash parity. The fixture is shared with the SDK test
/// suites (mirror of `test/data/debug/*`); both repos must produce the same
/// `expected_hash` for each input array. This is the most important test —
/// a drift here silently breaks every cache lookup.
#[test]
fn hash_parity_vectors() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/test/data/debug/input_hash_vectors.json"
    );
    let raw = std::fs::read_to_string(path).expect("read input_hash_vectors.json");
    let doc: Value = serde_json::from_str(&raw).expect("parse vectors");

    for case in doc["cases"].as_array().expect("cases array") {
        let name = case["name"].as_str().unwrap();
        let input = &case["input"];
        let expected = case["expected_hash"].as_str().unwrap();
        let actual = debug_input_hash(input);
        assert_eq!(actual, expected, "hash parity mismatch for case '{name}'");
    }
}

/// Object key order must not affect the hash (canonicalization sorts keys).
#[test]
fn hash_is_key_order_invariant() {
    let a = serde_json::json!([
        { "role": "user", "content": "hi", "name": "x" }
    ]);
    let b = serde_json::json!([
        { "name": "x", "content": "hi", "role": "user" }
    ]);
    assert_eq!(debug_input_hash(&a), debug_input_hash(&b));
}

/// EVERY `role == "system"` message is dropped before hashing — regardless
/// of content or position — so inputs that differ only in their system
/// message(s) hash identically to one with no system message at all.
#[test]
fn hash_ignores_system_message() {
    let without_sys = serde_json::json!([
        { "role": "user", "content": "hi" }
    ]);
    // single leading system message
    let leading = serde_json::json!([
        { "role": "system", "content": "prompt A" },
        { "role": "user", "content": "hi" }
    ]);
    // a different leading system message
    let leading_other = serde_json::json!([
        { "role": "system", "content": "totally different prompt B" },
        { "role": "user", "content": "hi" }
    ]);
    // empty-content system message (the v1 contract used to KEEP this)
    let empty_sys = serde_json::json!([
        { "role": "system", "content": "" },
        { "role": "user", "content": "hi" }
    ]);
    // multiple system messages, including a non-leading / trailing one
    let multi_sys = serde_json::json!([
        { "role": "system", "content": "one" },
        { "role": "user", "content": "hi" },
        { "role": "system", "content": [{ "type": "image", "url": "https://x/y.png" }] }
    ]);

    let expected = debug_input_hash(&without_sys);
    for input in [&leading, &leading_other, &empty_sys, &multi_sys] {
        assert_eq!(
            debug_input_hash(input),
            expected,
            "all system messages must be stripped before hashing"
        );
    }
}

fn uuid_with_suffix(suffix_hex: &str) -> Uuid {
    let mut s = "0".repeat(32 - suffix_hex.len());
    s.push_str(suffix_hex);
    Uuid::parse_str(&s).unwrap()
}

/// Build a row with a raw-response output and a single-user-message input
/// carrying `marker` so each span produces a distinct input hash unless the
/// marker repeats.
fn row(span_suffix: &str, marker: &str, response: &str) -> DebugCacheSpanRow {
    DebugCacheSpanRow {
        span_id: uuid_with_suffix(span_suffix),
        input: format!(r#"[{{"role":"user","content":"{marker}"}}]"#),
        raw_response: response.to_string(),
        gen_ai_output: String::new(),
        finish_reason: String::new(),
        finish_reasons: String::new(),
        model: String::new(),
        output: String::new(),
    }
}

const BIG: usize = usize::MAX;

#[test]
fn select_keeps_through_matched_needle_inclusive() {
    let rows = vec![
        row("a1", "m1", "{}"),
        row("a2", "m2", "{}"),
        row("a3", "m3", "{}"),
    ];
    // needle matches the 2nd span → keep first two, drop the third
    let (entries, outcome) = select_entries(&rows, &normalize_needle("a2"), BIG, BIG);
    assert_eq!(entries.len(), 2);
    assert_eq!(outcome, SelectionOutcome::NeedleFound);
}

#[test]
fn select_exhausted_when_needle_absent() {
    let rows = vec![row("a1", "m1", "{}"), row("a2", "m2", "{}")];
    let (_, outcome) = select_entries(&rows, &normalize_needle("ffff"), BIG, BIG);
    assert_eq!(
        outcome,
        SelectionOutcome::Exhausted,
        "absent needle → exhausted (caller drops the entries)"
    );
}

#[test]
fn select_dedupes_earliest_wins() {
    // same marker → same input hash; first (earliest) occurrence wins,
    // and the needle on the last span keeps the whole range.
    let rows = vec![
        row("a1", "dup", r#"{"first":true}"#),
        row("a2", "dup", r#"{"second":true}"#),
        row("a3", "other", "{}"),
    ];
    let (entries, outcome) = select_entries(&rows, &normalize_needle("a3"), BIG, BIG);
    assert_eq!(
        entries.len(),
        2,
        "duplicate input hash collapses to one entry"
    );
    match &entries[0].response {
        DebugCacheResponse::Raw { response, .. } => assert_eq!(response["first"], true),
        other => panic!("expected Raw, got {other:?}"),
    }
    assert_eq!(outcome, SelectionOutcome::NeedleFound);
}

#[test]
fn select_skips_spans_without_output() {
    let rows = vec![
        row("a1", "m1", ""), // no raw_response, no gen_ai → skipped
        row("a2", "m2", "{}"),
        row("a3", "m3", "{}"),
    ];
    let (entries, outcome) = select_entries(&rows, &normalize_needle("a3"), BIG, BIG);
    assert_eq!(entries.len(), 2, "output-less span is not admitted");
    assert_eq!(outcome, SelectionOutcome::NeedleFound);
}

#[test]
fn select_enforces_span_ceiling() {
    let rows = vec![
        row("a1", "m1", "{}"),
        row("a2", "m2", "{}"),
        row("a3", "m3", "{}"),
        row("a4", "m4", "{}"),
    ];
    // ceiling of 2 spans, needle would otherwise keep all four
    let (entries, outcome) = select_entries(&rows, &normalize_needle("a4"), 2, BIG);
    assert_eq!(entries.len(), 2, "span ceiling caps the kept set");
    assert_eq!(outcome, SelectionOutcome::CeilingHit);
}

/// Output-less spans before the needle don't consume the entry ceiling, so a
/// trace padded with them still reaches the needle. This is the pure-side of
/// the paging fix: the ceiling bounds *admitted entries*, not scanned rows.
#[test]
fn select_skips_output_less_spans_without_tripping_ceiling() {
    let rows = vec![
        row("a1", "m1", ""), // output-less, not admitted
        row("a2", "m2", ""), // output-less, not admitted
        row("a3", "m3", ""), // output-less, not admitted
        row("a4", "m4", "{}"),
    ];
    // ceiling of 1 admitted entry; the needle is on the only span that admits.
    let (entries, outcome) = select_entries(&rows, &normalize_needle("a4"), 1, BIG);
    assert_eq!(entries.len(), 1);
    assert_eq!(
        outcome,
        SelectionOutcome::NeedleFound,
        "output-less spans must not trip the entry ceiling before the needle"
    );
}

#[test]
fn select_enforces_byte_ceiling() {
    let rows = vec![
        row("a1", "m1", r#"{"x":"aaaaaaaaaa"}"#),
        row("a2", "m2", r#"{"x":"bbbbbbbbbb"}"#),
        row("a3", "m3", r#"{"x":"cccccccccc"}"#),
    ];
    // Learn the real envelope sizes, then cap so only the first fits.
    let (full, full_outcome) = select_entries(&rows, &normalize_needle("a3"), BIG, BIG);
    assert_eq!(full.len(), 3);
    assert_eq!(full_outcome, SelectionOutcome::NeedleFound);
    let cap = full[0].bytes + 1;
    let (one, outcome) = select_entries(&rows, &normalize_needle("a3"), BIG, cap);
    assert_eq!(one.len(), 1, "byte ceiling caps the kept set");
    assert_eq!(outcome, SelectionOutcome::CeilingHit);
}

/// A span whose response alone exceeds the byte budget can never be admitted,
/// so it must be skipped (like an output-less span) and the scan must keep
/// going toward the needle — not abort the whole warmup with zero entries.
#[test]
fn select_skips_oversized_span_and_keeps_later_spans() {
    let oversized = format!(r#"{{"x":"{}"}}"#, "z".repeat(1000));
    let rows = vec![
        row("a1", "m1", &oversized), // response alone exceeds the byte cap
        row("a2", "m2", "{}"),
        row("a3", "m3", "{}"),
    ];
    // Cap admits the two small spans but is far below the oversized response.
    let small_bytes = {
        let (e, _) = select_entries(&rows[1..2], &normalize_needle("zzzz"), BIG, BIG);
        e[0].bytes
    };
    let cap = small_bytes * 2 + 1;
    let (entries, outcome) = select_entries(&rows, &normalize_needle("a3"), BIG, cap);
    assert_eq!(
        entries.len(),
        2,
        "oversized span is skipped; smaller later spans up to the needle still warm"
    );
    assert_eq!(outcome, SelectionOutcome::NeedleFound);
}

#[test]
fn needle_suffix_matches_simple_id() {
    let span = Uuid::parse_str("0190d3f2-6a4b-7c8d-9e0f-112233445566").unwrap();
    let simple = span.simple().to_string();

    // full uuid, last-two-groups, raw 16-hex tail, short suffix all match
    for raw in [
        "0190d3f2-6a4b-7c8d-9e0f-112233445566",
        "9e0f-112233445566",
        "9e0f112233445566",
        "445566",
    ] {
        let needle = normalize_needle(raw);
        assert!(
            span_matches_needle(&needle, &span),
            "needle '{raw}' (norm '{needle}') should match {simple}"
        );
    }
}

#[test]
fn empty_needle_never_matches() {
    let span = uuid_with_suffix("abcdef");
    assert!(!span_matches_needle(&normalize_needle(""), &span));
}

#[test]
fn non_matching_needle_rejected() {
    let span = uuid_with_suffix("abcdef");
    assert!(!span_matches_needle(&normalize_needle("123456"), &span));
}

#[test]
fn resolve_prefers_raw_response() {
    let row = DebugCacheSpanRow {
        span_id: Uuid::nil(),
        input: String::new(),
        raw_response: r#"{"id":"resp_1","content":"hi"}"#.to_string(),
        gen_ai_output: r#"[{"role":"assistant"}]"#.to_string(),
        finish_reason: r#""stop""#.to_string(),
        finish_reasons: String::new(),
        model: String::new(),
        output: String::new(),
    };
    match resolve_response(&row).unwrap() {
        DebugCacheResponse::Raw {
            response,
            finish_reasons,
            ..
        } => {
            assert_eq!(response["id"], "resp_1");
            assert_eq!(finish_reasons, Some(vec!["stop".to_owned()]));
        }
        other => panic!("expected Raw, got {other:?}"),
    }
}

#[test]
fn resolve_falls_back_to_gen_ai() {
    let row = DebugCacheSpanRow {
        span_id: Uuid::nil(),
        input: String::new(),
        raw_response: String::new(),
        gen_ai_output: r#"[{"role":"assistant","content":"hi"}]"#.to_string(),
        finish_reason: r#""stop""#.to_string(),
        finish_reasons: String::new(),
        model: "gpt-4o".to_string(),
        output: String::new(),
    };
    match resolve_response(&row).unwrap() {
        DebugCacheResponse::GenAi {
            messages,
            finish_reasons,
            model,
        } => {
            assert_eq!(messages[0]["role"], "assistant");
            assert_eq!(finish_reasons, Some(vec!["stop".to_owned()]));
            assert_eq!(model.as_deref(), Some("gpt-4o"));
        }
        other => panic!("expected GenAi, got {other:?}"),
    }
}

#[test]
fn resolve_finish_reasons_array_preferred() {
    let row = DebugCacheSpanRow {
        span_id: Uuid::nil(),
        input: String::new(),
        raw_response: String::new(),
        gen_ai_output: r#"[{"role":"assistant"}]"#.to_string(),
        finish_reason: r#""stop""#.to_string(),
        finish_reasons: r#"["stop","length"]"#.to_string(),
        model: String::new(),
        output: String::new(),
    };
    match resolve_response(&row).unwrap() {
        DebugCacheResponse::GenAi { finish_reasons, .. } => {
            assert_eq!(
                finish_reasons,
                Some(vec!["stop".to_owned(), "length".to_owned()])
            );
        }
        other => panic!("expected GenAi, got {other:?}"),
    }
}

#[test]
fn resolve_gen_ai_null_finish_reason() {
    let row = DebugCacheSpanRow {
        span_id: Uuid::nil(),
        input: String::new(),
        raw_response: String::new(),
        gen_ai_output: r#"[{"role":"assistant"}]"#.to_string(),
        finish_reason: String::new(),
        finish_reasons: String::new(),
        model: String::new(),
        output: String::new(),
    };
    match resolve_response(&row).unwrap() {
        DebugCacheResponse::GenAi {
            finish_reasons,
            model,
            ..
        } => {
            assert_eq!(finish_reasons, None);
            assert_eq!(model, None);
        }
        other => panic!("expected GenAi, got {other:?}"),
    }
}

#[test]
fn resolve_none_without_output() {
    let row = DebugCacheSpanRow {
        span_id: Uuid::nil(),
        input: String::new(),
        raw_response: String::new(),
        gen_ai_output: String::new(),
        finish_reason: String::new(),
        finish_reasons: String::new(),
        model: String::new(),
        output: String::new(),
    };
    assert!(resolve_response(&row).is_none());
}

fn in_memory_cache() -> Arc<Cache> {
    Arc::new(Cache::InMemory(
        crate::cache::in_memory::InMemoryCache::new(None),
    ))
}

#[tokio::test]
async fn read_entry_hit_when_present() {
    let cache = in_memory_cache();
    let key = "k:hit";
    let response = DebugCacheResponse::Raw {
        response: serde_json::json!({ "ok": true }),
        finish_reasons: None,
        model: None,
    };
    cache
        .insert_with_ttl(key, response.clone(), 60)
        .await
        .unwrap();

    match read_entry(&cache, key).await {
        CacheLookupResponse::Hit { response: r } => assert_eq!(r, response),
        other => panic!("expected Hit, got {other:?}"),
    }
}

#[tokio::test]
async fn read_entry_miss_when_absent() {
    let cache = in_memory_cache();
    assert_eq!(
        read_entry(&cache, "k:absent").await,
        CacheLookupResponse::Miss {}
    );
}

#[tokio::test]
async fn wait_for_ready_times_out_then_succeeds() {
    let cache = in_memory_cache();
    let ready = "k:ready";
    // not yet warm → times out quickly
    assert!(!wait_for_ready(&cache, ready, Duration::from_millis(50)).await);
    // once the marker is set → resolves
    cache.insert_with_ttl(ready, true, 60).await.unwrap();
    assert!(wait_for_ready(&cache, ready, Duration::from_millis(50)).await);
}

/// The warmup heartbeat keeps the lock alive past its original TTL: an
/// expired lock can be re-acquired (so a renew must report it's gone), and a
/// live lock renewed before expiry stays held so no second warmup can start.
#[tokio::test]
async fn renew_lock_extends_held_lock_and_reports_expiry() {
    let cache = in_memory_cache();
    let lock = "k:warmlock";

    // Acquire with a 1s TTL.
    assert!(cache.try_acquire_lock(lock, 1).await.unwrap());
    // A second acquire fails while it's held.
    assert!(!cache.try_acquire_lock(lock, 1).await.unwrap());

    // Renew to a long TTL before it expires → still held, renew succeeds.
    assert!(cache.renew_lock(lock, 60).await.unwrap());
    // Sleep past the *original* 1s TTL; the renewal must have kept it alive.
    tokio::time::sleep(Duration::from_millis(1200)).await;
    assert!(
        !cache.try_acquire_lock(lock, 1).await.unwrap(),
        "renewed lock must still be held past its original TTL"
    );

    // Release, then a renew on the now-absent lock must report it's gone.
    cache.release_lock(lock).await.unwrap();
    assert!(
        !cache.renew_lock(lock, 60).await.unwrap(),
        "renewing a released/expired lock must return false"
    );
    // And it's freely re-acquirable.
    assert!(cache.try_acquire_lock(lock, 1).await.unwrap());
}

#[test]
fn outcome_serialization_is_tagged_camel_case() {
    let hit = CacheLookupResponse::Hit {
        response: DebugCacheResponse::Raw {
            response: Value::Object(serde_json::Map::new()),
            finish_reasons: None,
            model: None,
        },
    };
    let v = serde_json::to_value(&hit).unwrap();
    assert_eq!(v["outcome"], "hit");

    let miss = serde_json::to_value(CacheLookupResponse::Miss {}).unwrap();
    assert_eq!(miss["outcome"], "miss");

    let live = serde_json::to_value(CacheLookupResponse::Live {}).unwrap();
    assert_eq!(live["outcome"], "live");
}

/// All three keys are scoped by the normalized `cache_until` needle. Two windows
/// over the same `(project, trace)` must map to distinct entry / ready / lock
/// namespaces so a wider re-run warms cold instead of reading the narrower
/// window's entries (and so its lock can't block an unrelated window).
#[test]
fn keys_are_scoped_by_cache_until_window() {
    let project = uuid_with_suffix("aaaa");
    let trace = uuid_with_suffix("bbbb");
    let hash = "deadbeef";
    let w8 = normalize_needle("0000-000000000008");
    let w10 = normalize_needle("0000-000000000010");

    assert_ne!(
        entry_key(&project, &trace, &w8, hash),
        entry_key(&project, &trace, &w10, hash),
        "same input hash in different windows must not collide"
    );
    assert_ne!(
        ready_key(&project, &trace, &w8),
        ready_key(&project, &trace, &w10),
        "one window's ready marker must not satisfy another's lookup"
    );
    assert_ne!(
        lock_key(&project, &trace, &w8),
        lock_key(&project, &trace, &w10),
        "one window's warmup lock must not block another window"
    );
}

/// The needle in the key is the *normalized* form, so two `cache_until` spellings
/// of the same span (hyphenation / case) share one namespace and reuse the warm.
#[test]
fn keys_collapse_equivalent_cache_until_spellings() {
    let project = uuid_with_suffix("aaaa");
    let trace = uuid_with_suffix("bbbb");
    let a = normalize_needle("9E0F-112233445566");
    let b = normalize_needle("9e0f112233445566");
    assert_eq!(
        ready_key(&project, &trace, &a),
        ready_key(&project, &trace, &b)
    );
}
