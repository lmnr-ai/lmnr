use serde_json::json;

use super::*;

fn signal_input(structured_output: Value) -> SignalInput {
    SignalInput {
        name: "Test".to_string(),
        prompt: "Find things".to_string(),
        structured_output,
        sample_rate: None,
        disabled: None,
        trigger: None,
        filters: None,
        mode: None,
    }
}

fn valid_schema() -> Value {
    json!({
        "type": "object",
        "properties": { "reason": { "type": "string", "description": "why" } },
        "required": ["reason"],
    })
}

fn span_name_trigger(names: &[&str]) -> Trigger {
    Trigger::SpanName {
        span_names: names.iter().map(|n| n.to_string()).collect(),
    }
}

#[test]
fn condition_columns_are_rejected_as_filters() {
    for column in ["root_span_finished", "span_name"] {
        let err = normalize_filters(vec![
            json!({ "column": column, "operator": "eq", "value": "true" }),
        ])
        .expect_err("a trigger condition column must not be accepted as a filter");
        let msg = err.to_string();
        assert!(
            msg.contains("WHEN") && msg.contains("`trigger`"),
            "error should point the caller at `trigger`, got: {msg}"
        );
    }
}

#[test]
fn unknown_filter_column_lists_the_supported_ones() {
    let err = normalize_filters(vec![
        json!({ "column": "nope", "operator": "eq", "value": "1" }),
    ])
    .expect_err("unknown filter column must be rejected");
    let msg = err.to_string();
    for expected in ["total_token_count", "status", "span_names"] {
        assert!(msg.contains(expected), "{expected} should be listed: {msg}");
    }
}

#[test]
fn span_names_filter_is_independent_of_the_span_name_trigger() {
    // The pre-split API made these two easy to confuse, since both were entries
    // in a list. They are now separate fields entirely.
    let trigger = span_name_trigger(&["agent.run"]);
    let filters = normalize_filters(vec![
        json!({ "column": "span_names", "operator": "ne", "value": "healthcheck" }),
    ])
    .expect("span_names is a filter column");

    assert_eq!(
        trigger.to_conditions(),
        json!([{ "column": "span_name", "operator": "includes", "value": ["agent.run"] }])
    );
    assert_eq!(filters.len(), 1);
}

#[test]
fn root_span_trigger_stores_the_string_true() {
    // The evaluator compares the string, not a JSON boolean.
    assert_eq!(
        Trigger::RootSpanFinished.to_conditions(),
        json!([{ "column": "root_span_finished", "operator": "eq", "value": "true" }])
    );
}

#[test]
fn span_name_trigger_always_stores_includes_with_an_array() {
    // A single name used to be stored as a bare string with `eq`; `includes`
    // with an array is what the drawer writes and both shapes fire.
    assert_eq!(
        span_name_trigger(&["only"]).to_conditions(),
        json!([{ "column": "span_name", "operator": "includes", "value": ["only"] }])
    );
    assert_eq!(
        span_name_trigger(&["a", "b"]).to_conditions(),
        json!([{ "column": "span_name", "operator": "includes", "value": ["a", "b"] }])
    );
}

#[test]
fn span_name_blanks_are_dropped_and_all_blank_rejected() {
    let normalized = span_name_trigger(&["  agent.run  ", "", "  "]).normalized();
    assert_eq!(normalized, span_name_trigger(&["agent.run"]));
    normalized.validate().expect("one real name is firable");

    assert!(
        span_name_trigger(&["", " "]).validate().is_err(),
        "an all-blank span name list can never match and must be rejected"
    );
}

#[test]
fn absent_trigger_defaults_and_explicit_null_clears() {
    let absent: SignalInput = serde_json::from_value(json!({
        "name": "n", "prompt": "p", "structuredOutput": valid_schema(),
    }))
    .unwrap();
    assert!(absent.trigger.is_none(), "absent key must default");

    let cleared: SignalInput = serde_json::from_value(json!({
        "name": "n", "prompt": "p", "structuredOutput": valid_schema(), "trigger": null,
    }))
    .unwrap();
    assert_eq!(
        cleared.trigger,
        Some(None),
        "explicit null must be distinguishable so a signal can be backfill-only"
    );
}

#[test]
fn trigger_round_trips_through_storage() {
    for trigger in [
        Trigger::RootSpanFinished,
        span_name_trigger(&["agent.run"]),
        span_name_trigger(&["a", "b"]),
    ] {
        let stored = trigger.to_conditions();
        assert_eq!(
            Trigger::from_conditions(&stored),
            Some(trigger.clone()),
            "{trigger:?} must survive a storage round trip"
        );
    }
}

#[test]
fn legacy_single_name_condition_reads_back_as_a_span_name_trigger() {
    // Rows written before the split stored one bare string with `eq`.
    let legacy = json!([{ "column": "span_name", "operator": "eq", "value": "agent.run" }]);
    assert_eq!(
        Trigger::from_conditions(&legacy),
        Some(span_name_trigger(&["agent.run"]))
    );
}

#[test]
fn unfirable_stored_conditions_read_back_as_no_trigger() {
    for conditions in [
        // Backfill-only signal.
        json!([]),
        // A column the evaluator has no arm for — stored, never fires.
        json!([{ "column": "total_token_count", "operator": "gt", "value": "1000" }]),
        // Blank span names can never match a span.
        json!([{ "column": "span_name", "operator": "includes", "value": [] }]),
        json!([{ "column": "span_name", "operator": "includes", "value": ["", " "] }]),
    ] {
        assert_eq!(
            Trigger::from_conditions(&conditions),
            None,
            "{conditions} does not fire, so the API must not report a trigger"
        );
    }
}

#[test]
fn span_name_wins_over_root_span_in_a_legacy_multi_column_row() {
    // No UI ever wrote both, but `trigger_fires` ANDs conditions, so such a row
    // only fires on the named span's batch.
    let both = json!([
        { "column": "root_span_finished", "operator": "eq", "value": "true" },
        { "column": "span_name", "operator": "includes", "value": ["agent.run"] },
    ]);
    assert_eq!(
        Trigger::from_conditions(&both),
        Some(span_name_trigger(&["agent.run"]))
    );
}

#[test]
fn defaults_match_the_frontend_seed() {
    assert_eq!(default_trigger(), Trigger::RootSpanFinished);
    assert_eq!(
        default_filters(),
        vec![json!({ "column": "total_token_count", "operator": "gt", "value": "1000" })]
    );
    assert_eq!(Mode::default(), Mode::Batch);
}

#[test]
fn mode_round_trips_and_unknown_discriminants_are_batch() {
    assert_eq!(Mode::Batch.to_i16(), 0);
    assert_eq!(Mode::Realtime.to_i16(), 1);
    assert_eq!(Mode::from_i16(0), Mode::Batch);
    assert_eq!(Mode::from_i16(1), Mode::Realtime);
    // Matches `SignalMode::from_u8`, which treats anything else as batch.
    assert_eq!(Mode::from_i16(7), Mode::Batch);
    assert_eq!(Mode::from_i16(-1), Mode::Batch);
}

#[test]
fn mode_is_named_not_numeric_on_the_wire() {
    let input: UpdateSignalInput = serde_json::from_value(json!({ "mode": "realtime" })).unwrap();
    assert_eq!(input.mode, Some(Mode::Realtime));

    assert!(
        serde_json::from_value::<UpdateSignalInput>(json!({ "mode": 1 })).is_err(),
        "the raw discriminant is a storage detail and must not be accepted"
    );
    assert!(
        serde_json::from_value::<UpdateSignalInput>(json!({ "mode": "sometimes" })).is_err(),
        "an unknown mode must be rejected rather than silently becoming batch"
    );
}

#[test]
fn trigger_type_must_be_a_known_variant() {
    assert!(
        serde_json::from_value::<Trigger>(json!({ "type": "rootSpanFinished" })).is_ok(),
        "the tag is camelCase"
    );
    assert!(
        serde_json::from_value::<Trigger>(json!({ "type": "root_span_finished" })).is_err(),
        "the stored column name is not the API tag"
    );
    assert!(
        serde_json::from_value::<Trigger>(json!({ "type": "spanName" })).is_err(),
        "spanName requires spanNames"
    );
    assert!(
        serde_json::from_value::<Trigger>(
            json!({ "type": "spanName", "spanNames": ["agent.run"] })
        )
        .is_ok()
    );
}

#[test]
fn total_token_count_string_is_trimmed() {
    let normalized = normalize_filters(vec![
        json!({ "column": "total_token_count", "operator": "gt", "value": "  1000  " }),
    ])
    .unwrap();
    assert_eq!(normalized[0]["value"], json!("1000"));
}

#[test]
fn non_finite_token_counts_are_rejected() {
    for value in ["NaN", "inf", "-inf", "", "   ", "abc"] {
        assert!(
            normalize_filters(vec![
                json!({ "column": "total_token_count", "operator": "gt", "value": value }),
            ])
            .is_err(),
            "{value:?} must be rejected as a token count"
        );
    }
}

#[test]
fn status_accepts_error_and_success_only() {
    for value in ["error", "success"] {
        assert!(
            normalize_filters(vec![
                json!({ "column": "status", "operator": "eq", "value": value }),
            ])
            .is_ok(),
            "{value} must be accepted"
        );
    }
    assert!(
        normalize_filters(vec![
            json!({ "column": "status", "operator": "eq", "value": "OK" }),
        ])
        .is_err(),
        "a status no trace can ever have must be rejected"
    );
}

#[test]
fn blank_span_names_filter_is_rejected() {
    for value in ["", "   "] {
        assert!(
            normalize_filters(vec![
                json!({ "column": "span_names", "operator": "ne", "value": value }),
            ])
            .is_err(),
            "blank span_names target {value:?} must be rejected"
        );
    }
}

#[test]
fn filter_operators_are_checked_per_column() {
    assert!(
        normalize_filters(vec![
            json!({ "column": "status", "operator": "gt", "value": "error" }),
        ])
        .is_err(),
        "status is not orderable"
    );
    assert!(
        normalize_filters(vec![
            json!({ "column": "total_token_count", "operator": "includes", "value": "10" }),
        ])
        .is_err(),
        "a number column has no set membership"
    );
}

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

#[test]
fn create_rejects_an_unfirable_span_name_trigger() {
    let mut input = signal_input(valid_schema());
    input.trigger = Some(Some(span_name_trigger(&["", "  "])));
    assert!(
        validate_signal_input(&mut input).is_err(),
        "a signal that could never fire must not be created silently"
    );
}

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
            "a": { "type": "string" },
            "b": { "type": "string" },
        },
    });
    assert!(validate_structured_output(&missing).is_err());

    let partial = json!({
        "type": "object",
        "properties": {
            "a": { "type": "string" },
            "b": { "type": "string" },
        },
        "required": ["a"],
    });
    assert!(validate_structured_output(&partial).is_err());

    let extra = json!({
        "type": "object",
        "properties": { "a": { "type": "string" } },
        "required": ["a", "b"],
    });
    assert!(validate_structured_output(&extra).is_err());

    let exact = json!({
        "type": "object",
        "properties": {
            "a": { "type": "string" },
            "b": { "type": "string" },
        },
        "required": ["b", "a"],
    });
    assert!(validate_structured_output(&exact).is_ok());
}

#[test]
fn schema_must_have_at_least_one_property() {
    let schema = json!({ "type": "object", "properties": {}, "required": [] });
    assert!(validate_structured_output(&schema).is_err());
}

#[test]
fn extra_json_schema_keys_are_ignored() {
    let top_level = json!({
        "type": "object",
        "properties": { "a": { "type": "string" } },
        "required": ["a"],
        "additionalProperties": false,
    });
    assert!(validate_structured_output(&top_level).is_ok());

    let per_property = json!({
        "type": "object",
        "properties": { "a": { "type": "string", "format": "email" } },
        "required": ["a"],
    });
    assert!(validate_structured_output(&per_property).is_ok());
}

#[test]
fn enum_values_must_be_unique_non_empty_strings() {
    let duplicates = json!({
        "type": "object",
        "properties": { "a": { "type": "string", "enum": ["x", "x"] } },
    });
    assert!(validate_structured_output(&duplicates).is_err());

    let empty = json!({
        "type": "object",
        "properties": { "a": { "type": "string", "enum": [] } },
    });
    assert!(validate_structured_output(&empty).is_err());

    let ok = json!({
        "type": "object",
        "properties": { "a": { "type": "string", "enum": ["low", "high"] } },
        "required": ["a"],
    });
    assert!(validate_structured_output(&ok).is_ok());
}

#[test]
fn missing_description_is_allowed() {
    let schema = json!({
        "type": "object",
        "properties": { "a": { "type": "string" } },
        "required": ["a"],
    });
    assert!(validate_structured_output(&schema).is_ok());
}

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

#[test]
fn update_input_leaves_absent_firing_fields_alone() {
    let input: UpdateSignalInput = serde_json::from_value(json!({ "prompt": "x" })).unwrap();
    assert!(
        input.trigger.is_none(),
        "absent trigger must not be touched"
    );
    assert!(
        input.filters.is_none(),
        "absent filters must not be touched"
    );
    assert!(input.mode.is_none(), "absent mode must not be touched");
}

#[test]
fn update_input_distinguishes_absent_from_empty_filters() {
    let absent: UpdateSignalInput = serde_json::from_value(json!({ "prompt": "x" })).unwrap();
    assert!(absent.filters.is_none());

    let cleared: UpdateSignalInput = serde_json::from_value(json!({ "filters": [] })).unwrap();
    assert_eq!(
        cleared.filters.map(|f| f.len()),
        Some(0),
        "`[]` must clear filters rather than read as absent"
    );
}

#[test]
fn update_input_distinguishes_absent_from_null_trigger() {
    let absent: UpdateSignalInput = serde_json::from_value(json!({ "prompt": "x" })).unwrap();
    assert!(absent.trigger.is_none());

    let cleared: UpdateSignalInput = serde_json::from_value(json!({ "trigger": null })).unwrap();
    assert_eq!(
        cleared.trigger,
        Some(None),
        "explicit null must stop the signal firing rather than read as absent"
    );
}

#[test]
fn trigger_patch_is_empty_only_when_nothing_is_set() {
    assert!(TriggerPatch::default().is_empty());
    assert!(
        !TriggerPatch {
            mode: Some(1),
            ..Default::default()
        }
        .is_empty(),
        "a mode-only patch must still write"
    );
    assert!(
        !TriggerPatch {
            filters: Some(json!([])),
            ..Default::default()
        }
        .is_empty(),
        "clearing filters must still write"
    );
}
