//! Validation tests for the signal CRUD service. No DB required — these pin the
//! trigger/filter split (LAM-2031) and the payload-schema rules.

use serde_json::json;

use super::*;

fn trigger(conditions: Vec<Value>, filters: Vec<Value>) -> TriggerInput {
    TriggerInput {
        conditions,
        filters,
        mode: None,
    }
}

fn root_span_condition() -> Value {
    json!({ "column": "root_span_finished", "operator": "eq", "value": "true" })
}

fn signal_input(structured_output: Value) -> SignalInput {
    SignalInput {
        name: "Test".to_string(),
        prompt: "Find things".to_string(),
        structured_output,
        sample_rate: None,
        disabled: None,
    }
}

fn valid_schema() -> Value {
    json!({
        "type": "object",
        "properties": { "reason": { "type": "string", "description": "why" } },
        "required": ["reason"],
    })
}

// ---------------------------------------------------------------------------
// The trigger/filter split — the whole point of the LAM-2031 rework.
// ---------------------------------------------------------------------------

/// A filter column passed as a condition must be REJECTED, not silently stored:
/// `evaluate_trigger_condition` has no arm for it, so the trigger would never
/// fire and the signal would look configured while being inert.
#[test]
fn filter_column_in_conditions_is_rejected() {
    for column in ["total_token_count", "status", "span_names"] {
        let err = normalize_trigger(trigger(
            vec![json!({ "column": column, "operator": "eq", "value": "1" })],
            vec![],
        ))
        .expect_err("filter column must not be accepted as a condition");
        let msg = err.to_string();
        assert!(
            msg.contains("filter column") && msg.contains("`filters`"),
            "error should point the caller at `filters`, got: {msg}"
        );
    }
}

/// Symmetric case: a condition column passed as a filter would never pass
/// `evaluate_filter`, silently disabling the signal.
#[test]
fn condition_column_in_filters_is_rejected() {
    for column in ["root_span_finished", "span_name"] {
        let err = normalize_trigger(trigger(
            vec![root_span_condition()],
            vec![json!({ "column": column, "operator": "eq", "value": "true" })],
        ))
        .expect_err("condition column must not be accepted as a filter");
        let msg = err.to_string();
        assert!(
            msg.contains("trigger condition") && msg.contains("`conditions`"),
            "error should point the caller at `conditions`, got: {msg}"
        );
    }
}

/// `span_name` (trigger, batch-scoped) and `span_names` (filter, trace-wide) are
/// different columns. Both must be accepted in their own slot.
#[test]
fn span_name_and_span_names_are_distinct_columns() {
    let normalized = normalize_trigger(trigger(
        vec![json!({ "column": "span_name", "operator": "includes", "value": ["agent.run"] })],
        vec![json!({ "column": "span_names", "operator": "ne", "value": "healthcheck" })],
    ))
    .expect("both columns valid in their own slot");

    assert_eq!(normalized.conditions.len(), 1);
    assert_eq!(normalized.filters.len(), 1);
}

/// An empty condition list never fires — reject rather than persist an inert signal.
#[test]
fn empty_conditions_are_rejected() {
    let err = normalize_trigger(trigger(vec![], vec![])).expect_err("empty conditions must reject");
    assert!(err.to_string().contains("at least one condition"));
}

/// Empty filters is legitimate: run on every trace the trigger fires for.
#[test]
fn empty_filters_are_allowed() {
    let normalized =
        normalize_trigger(trigger(vec![root_span_condition()], vec![])).expect("no filters is ok");
    assert!(normalized.filters.is_empty());
}

/// The default seed must match the frontend's byte-for-byte so a CLI-created
/// signal is indistinguishable from a UI-created one.
#[test]
fn default_trigger_matches_frontend_seed() {
    let defaults = default_triggers();
    assert_eq!(defaults.len(), 1);
    let normalized = normalize_trigger(defaults.into_iter().next().unwrap()).unwrap();

    assert_eq!(normalized.conditions, vec![root_span_condition()]);
    assert_eq!(
        normalized.filters,
        vec![json!({ "column": "total_token_count", "operator": "gt", "value": "1000" })]
    );
}

// ---------------------------------------------------------------------------
// Per-column value rules
// ---------------------------------------------------------------------------

/// The evaluator's `parse::<f64>()` does NOT trim, so a stored " 1000 " would
/// evaluate false forever. Trim at the boundary.
#[test]
fn total_token_count_string_is_trimmed() {
    let normalized = normalize_trigger(trigger(
        vec![root_span_condition()],
        vec![json!({ "column": "total_token_count", "operator": "gt", "value": "  1000  " })],
    ))
    .unwrap();
    assert_eq!(normalized.filters[0]["value"], json!("1000"));
}

/// Rust's `parse::<f64>()` accepts "NaN"/"inf"; a NaN threshold makes every
/// comparison false (or always-true for `ne`), silently breaking the filter.
#[test]
fn non_finite_token_counts_are_rejected() {
    for value in ["NaN", "inf", "-inf", "", "   ", "abc"] {
        assert!(
            normalize_trigger(trigger(
                vec![root_span_condition()],
                vec![json!({ "column": "total_token_count", "operator": "gt", "value": value })],
            ))
            .is_err(),
            "{value:?} must be rejected as a token count"
        );
    }
}

/// The evaluator derives status from `has_error`, so only these two can match.
#[test]
fn status_accepts_error_and_success_only() {
    for value in ["error", "success"] {
        assert!(
            normalize_trigger(trigger(
                vec![root_span_condition()],
                vec![json!({ "column": "status", "operator": "eq", "value": value })],
            ))
            .is_ok(),
            "{value} must be accepted"
        );
    }
    assert!(
        normalize_trigger(trigger(
            vec![root_span_condition()],
            vec![json!({ "column": "status", "operator": "eq", "value": "OK" })],
        ))
        .is_err(),
        "a status no trace can ever have must be rejected"
    );
}

/// A blank `span_names` target matches EVERYTHING under `ne` (the shared
/// FilterSchema accepts whitespace-only), so it must be rejected.
#[test]
fn blank_span_names_filter_is_rejected() {
    for value in ["", "   "] {
        assert!(
            normalize_trigger(trigger(
                vec![root_span_condition()],
                vec![json!({ "column": "span_names", "operator": "ne", "value": value })],
            ))
            .is_err(),
            "blank span_names target {value:?} must be rejected"
        );
    }
}

/// Blanks inside a span-name list are dropped (the evaluator ignores them), but
/// an all-blank list can never match and is rejected.
#[test]
fn span_name_blanks_are_dropped_and_all_blank_rejected() {
    let normalized = normalize_trigger(trigger(
        vec![
            json!({ "column": "span_name", "operator": "includes", "value": ["  agent.run  ", "", "  "] }),
        ],
        vec![],
    ))
    .unwrap();
    assert_eq!(normalized.conditions[0]["value"], json!(["agent.run"]));

    assert!(
        normalize_trigger(trigger(
            vec![json!({ "column": "span_name", "operator": "includes", "value": ["", " "] })],
            vec![],
        ))
        .is_err(),
        "an all-blank span_name list can never match and must be rejected"
    );
}

/// Multiple names need `includes` — `eq` against an array never matches in the
/// evaluator's scalar comparison.
#[test]
fn multiple_span_names_require_includes() {
    assert!(
        normalize_trigger(trigger(
            vec![json!({ "column": "span_name", "operator": "eq", "value": ["a", "b"] })],
            vec![],
        ))
        .is_err(),
        "multi-name eq must be rejected"
    );

    let single = normalize_trigger(trigger(
        vec![json!({ "column": "span_name", "operator": "eq", "value": ["only"] })],
        vec![],
    ))
    .unwrap();
    // eq is scalar-valued, so a one-element list collapses to the bare string.
    assert_eq!(single.conditions[0]["value"], json!("only"));
}

#[test]
fn root_span_finished_requires_the_string_true() {
    assert!(
        normalize_trigger(trigger(
            vec![json!({ "column": "root_span_finished", "operator": "eq", "value": true })],
            vec![],
        ))
        .is_err(),
        "a JSON boolean must be rejected — the evaluator compares the string \"true\""
    );
}

#[test]
fn mode_outside_zero_or_one_is_rejected() {
    for mode in [-1i16, 2, 7] {
        let input = TriggerInput {
            conditions: vec![root_span_condition()],
            filters: vec![],
            mode: Some(mode),
        };
        assert!(
            normalize_trigger(input).is_err(),
            "mode {mode} must be rejected"
        );
    }
}

// ---------------------------------------------------------------------------
// Signal + payload-schema validation
// ---------------------------------------------------------------------------

/// A name is trimmed for STORAGE: otherwise " Foo" and "Foo" are distinct to the
/// unique constraint and the derived alert renders as " Foo alert".
#[test]
fn name_is_trimmed_for_storage() {
    let mut input = signal_input(valid_schema());
    input.name = "  Padded  ".to_string();
    validate_signal_input(&mut input).unwrap();
    assert_eq!(input.name, "Padded");
}

#[test]
fn blank_name_and_prompt_are_rejected() {
    let mut blank_name = signal_input(valid_schema());
    blank_name.name = "   ".to_string();
    assert!(validate_signal_input(&mut blank_name).is_err());

    let mut blank_prompt = signal_input(valid_schema());
    blank_prompt.prompt = "  ".to_string();
    assert!(validate_signal_input(&mut blank_prompt).is_err());
}

/// The limit is CHARACTERS, not bytes — a multibyte name at the boundary must not
/// be rejected for its UTF-8 length.
#[test]
fn name_length_limit_counts_characters() {
    let mut at_limit = signal_input(valid_schema());
    at_limit.name = "é".repeat(SIGNAL_NAME_MAX_LEN);
    validate_signal_input(&mut at_limit).expect("255 multibyte chars is within the limit");

    let mut over = signal_input(valid_schema());
    over.name = "a".repeat(SIGNAL_NAME_MAX_LEN + 1);
    assert!(validate_signal_input(&mut over).is_err());
}

#[test]
fn sample_rate_bounds_are_enforced() {
    for rate in [0i64, 96, -5] {
        let mut input = signal_input(valid_schema());
        input.sample_rate = Some(rate);
        assert!(
            validate_signal_input(&mut input).is_err(),
            "sampleRate {rate} must be rejected"
        );
    }
    for rate in [1i64, 50, 95] {
        let mut input = signal_input(valid_schema());
        input.sample_rate = Some(rate);
        assert!(validate_signal_input(&mut input).is_ok());
    }
}

#[test]
fn field_names_must_be_identifiers() {
    for bad in ["1st", "has space", "dash-name", "", "payload.f1"] {
        let schema = json!({
            "type": "object",
            "properties": { bad: { "type": "string", "description": "d" } },
            "required": [bad],
        });
        assert!(
            validate_structured_output(&schema).is_err(),
            "field name {bad:?} must be rejected"
        );
    }
}

#[test]
fn required_must_list_exactly_the_properties() {
    let missing = json!({
        "type": "object",
        "properties": {
            "a": { "type": "string", "description": "d" },
            "b": { "type": "string", "description": "d" },
        },
        "required": ["a"],
    });
    assert!(validate_structured_output(&missing).is_err());

    let extra = json!({
        "type": "object",
        "properties": { "a": { "type": "string", "description": "d" } },
        "required": ["a", "ghost"],
    });
    assert!(validate_structured_output(&extra).is_err());
}

#[test]
fn schema_must_have_at_least_one_property() {
    let schema = json!({ "type": "object", "properties": {}, "required": [] });
    assert!(validate_structured_output(&schema).is_err());
}

#[test]
fn unknown_schema_keys_are_rejected() {
    let top_level = json!({
        "type": "object",
        "properties": { "a": { "type": "string", "description": "d" } },
        "required": ["a"],
        "additionalProperties": false,
    });
    assert!(validate_structured_output(&top_level).is_err());

    let per_property = json!({
        "type": "object",
        "properties": { "a": { "type": "string", "description": "d", "format": "email" } },
        "required": ["a"],
    });
    assert!(validate_structured_output(&per_property).is_err());
}

#[test]
fn enum_rules_match_the_drawer() {
    let non_string = json!({
        "type": "object",
        "properties": { "a": { "type": "number", "description": "d", "enum": ["1"] } },
        "required": ["a"],
    });
    assert!(validate_structured_output(&non_string).is_err());

    let duplicates = json!({
        "type": "object",
        "properties": { "a": { "type": "string", "description": "d", "enum": ["x", "x"] } },
        "required": ["a"],
    });
    assert!(validate_structured_output(&duplicates).is_err());

    let untrimmed = json!({
        "type": "object",
        "properties": { "a": { "type": "string", "description": "d", "enum": [" x"] } },
        "required": ["a"],
    });
    assert!(validate_structured_output(&untrimmed).is_err());

    let empty = json!({
        "type": "object",
        "properties": { "a": { "type": "string", "description": "d", "enum": [] } },
        "required": ["a"],
    });
    assert!(validate_structured_output(&empty).is_err());

    let ok = json!({
        "type": "object",
        "properties": { "a": { "type": "string", "description": "d", "enum": ["low", "high"] } },
        "required": ["a"],
    });
    assert!(validate_structured_output(&ok).is_ok());
}

#[test]
fn missing_description_is_rejected() {
    let schema = json!({
        "type": "object",
        "properties": { "a": { "type": "string" } },
        "required": ["a"],
    });
    assert!(validate_structured_output(&schema).is_err());
}

// ---------------------------------------------------------------------------
// Wire-shape semantics (absent vs explicit-null vs empty)
// ---------------------------------------------------------------------------

/// An absent `sampleRate` key must be distinguishable from an explicit `null`:
/// serde's plain `Option` collapses both, which would make "clear it" and "leave
/// it" the same request.
#[test]
fn update_input_distinguishes_absent_from_null_sample_rate() {
    let absent: UpdateSignalInput = serde_json::from_value(json!({ "prompt": "x" })).unwrap();
    assert_eq!(absent.sample_rate, None, "absent key must be None");

    let explicit_null: UpdateSignalInput =
        serde_json::from_value(json!({ "sampleRate": null })).unwrap();
    assert_eq!(
        explicit_null.sample_rate,
        Some(None),
        "explicit null must be Some(None) so the key is cleared"
    );

    let set: UpdateSignalInput = serde_json::from_value(json!({ "sampleRate": 40 })).unwrap();
    assert_eq!(set.sample_rate, Some(Some(40)));
}

/// Absent `triggers` leaves the signal's triggers alone; `[]` clears them.
#[test]
fn update_input_distinguishes_absent_from_empty_triggers() {
    let absent: UpdateSignalInput = serde_json::from_value(json!({ "prompt": "x" })).unwrap();
    assert!(absent.triggers.is_none());

    let cleared: UpdateSignalInput = serde_json::from_value(json!({ "triggers": [] })).unwrap();
    assert_eq!(cleared.triggers.map(|t| t.len()), Some(0));
}

/// A typo'd trigger key must fail loudly rather than being silently ignored
/// (e.g. `filter` instead of `filters` would drop every filter).
#[test]
fn unknown_trigger_keys_are_rejected() {
    let err = serde_json::from_value::<TriggerInput>(json!({
        "conditions": [root_span_condition()],
        "filter": [],
    }))
    .expect_err("a misspelled trigger key must not be silently dropped");
    assert!(err.to_string().contains("filter"));
}
