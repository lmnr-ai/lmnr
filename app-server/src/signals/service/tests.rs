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
fn trigger_maps_to_the_shapes_the_evaluator_fires_on() {
    // The evaluator compares the string "true", not a JSON boolean, and reads
    // span names via `includes` with an array.
    assert_eq!(
        Trigger::RootSpanFinished.to_conditions(),
        json!([{ "column": "root_span_finished", "operator": "eq", "value": "true" }])
    );
    assert_eq!(
        span_name_trigger(&["a", "b"]).to_conditions(),
        json!([{ "column": "span_name", "operator": "includes", "value": ["a", "b"] }])
    );

    for trigger in [Trigger::RootSpanFinished, span_name_trigger(&["agent.run"])] {
        assert_eq!(
            Trigger::from_conditions(&trigger.to_conditions()),
            Some(trigger.clone()),
            "{trigger:?} must survive a storage round trip"
        );
    }
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
fn span_name_wins_when_both_condition_columns_are_stored() {
    // The evaluator ANDs conditions, so a row carrying both only fires on the
    // named span's batch — report that, not root-span-finished.
    assert_eq!(
        Trigger::from_conditions(&json!([
            { "column": "root_span_finished", "operator": "eq", "value": "true" },
            { "column": "span_name", "operator": "includes", "value": ["agent.run"] },
        ])),
        Some(span_name_trigger(&["agent.run"]))
    );
    assert_eq!(
        Trigger::from_conditions(
            &json!([{ "column": "span_name", "operator": "eq", "value": ["agent.run"] }])
        ),
        Some(span_name_trigger(&["agent.run"]))
    );
}

#[test]
fn conditions_this_enum_cannot_describe_are_not_reported() {
    for conditions in [
        json!([]),
        json!([{ "column": "total_token_count", "operator": "gt", "value": "1000" }]),
        json!([{ "column": "span_name", "operator": "gt", "value": ["a"] }]),
        json!([{ "column": "span_name", "operator": "includes", "value": ["", " "] }]),
        // `ne` fires when NONE of these spans finished. `Trigger::SpanName` can
        // only say the positive case, and `to_conditions` writes `includes`, so
        // reporting one would INVERT it if a later write round-tripped.
        json!([{ "column": "span_name", "operator": "ne", "value": ["agent.run"] }]),
        json!([
            { "column": "root_span_finished", "operator": "eq", "value": "true" },
            { "column": "span_name", "operator": "ne", "value": ["healthcheck"] },
        ]),
    ] {
        assert_eq!(
            Trigger::from_conditions(&conditions),
            None,
            "{conditions} must not be reported as a trigger"
        );
    }
}

#[test]
fn defaults_match_the_frontend_seed() {
    assert_eq!(default_trigger(), Trigger::RootSpanFinished);
    assert_eq!(
        default_filters(),
        vec![json!({ "column": "total_token_count", "operator": "gt", "value": "1000" })]
    );
    assert_eq!(Mode::default(), Mode::Realtime);
}

#[test]
fn mode_is_named_on_the_wire_and_numeric_in_storage() {
    assert_eq!(Mode::Batch.to_i16(), 0);
    assert_eq!(Mode::Realtime.to_i16(), 1);
    assert_eq!(Mode::from_i16(1), Mode::Realtime);
    // Matches `SignalMode::from_u8`, which treats anything else as batch.
    assert_eq!(Mode::from_i16(7), Mode::Batch);

    let input: UpdateSignalInput = serde_json::from_value(json!({ "mode": "realtime" })).unwrap();
    assert_eq!(input.mode, Some(Mode::Realtime));
    assert!(
        serde_json::from_value::<UpdateSignalInput>(json!({ "mode": 1 })).is_err(),
        "the raw discriminant is a storage detail and must not be accepted"
    );
    assert!(serde_json::from_value::<UpdateSignalInput>(json!({ "mode": "sometimes" })).is_err());
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
    input.trigger = Some(span_name_trigger(&["", "  "]));
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
fn omitted_patch_fields_are_left_alone() {
    let absent: UpdateSignalInput = serde_json::from_value(json!({ "prompt": "x" })).unwrap();
    assert_eq!(absent.sample_rate, None);
    assert!(absent.trigger.is_none());
    assert!(absent.filters.is_none());
    assert!(absent.mode.is_none());

    let nulls: UpdateSignalInput =
        serde_json::from_value(json!({ "sampleRate": null, "trigger": null })).unwrap();
    assert_eq!(
        nulls.sample_rate,
        Some(None),
        "sampleRate null clears; trigger null still means omit"
    );
    assert!(nulls.trigger.is_none());

    let set: UpdateSignalInput = serde_json::from_value(json!({ "sampleRate": 40 })).unwrap();
    assert_eq!(set.sample_rate, Some(Some(40)));
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
