//! Hard-coded signal trigger conditions (LAM-2020).
//!
//! Stored triggers are free-form `Filter { column, operator, value }` rows (the
//! frontend zod schema has no column allowlist), but the signal UI can only
//! ever produce four of them — see `SIGNAL_TRIGGER_COLUMNS` in
//! `frontend/components/signals/trigger-filter-field.tsx`. Pinning that set
//! here is what lets trigger evaluation run off the current batch plus a thin
//! per-trace cache state, with no cumulative read-back per batch.
//!
//! Anything outside the set is REJECTED (the trigger never fires) rather than
//! silently ignored: `matches_filters` is an AND over conditions, so treating
//! an unparseable filter as "true" would fire a signal the user didn't ask for.
//! That matches the previous generic evaluator, which returned `false` for
//! unknown columns.

use std::collections::HashSet;

use serde_json::Value;
use uuid::Uuid;

use crate::ch::traces::TraceAggregation;
use crate::db::utils::{Filter, FilterOperator, evaluate_number_filter};

/// Per-trace state that a single ingest batch cannot answer on its own.
///
/// `span_name` / `root_span_finished` are deliberately absent: they are
/// evaluated against the current batch only. Triggers fire at most once per
/// trace (the `signal_trigger_lock` key, 24h TTL), and these two conditions are
/// the intended "once per trace" half of a rule — the retriggering half
/// (`total_token_count > N`) is what they're meant to be paired with. Keeping
/// them batch-local costs nothing that the lock doesn't already bound.
#[derive(Debug, Clone, Default)]
pub struct TraceTriggerState {
    /// Whether ANY span in this trace has reported `status = "error"`, across
    /// all batches seen so far.
    pub seen_error: bool,
    /// Cumulative `total_tokens` across all batches seen so far.
    pub total_tokens: i64,
    /// The trace's user id, from whichever batch first carried one. Not a
    /// trigger condition — per-user sampling reads it, and it has to be
    /// cross-batch for the same reason: a later batch whose spans carry no
    /// `user_id` must not make the trace look like an anonymous one.
    pub user_id: Option<String>,
}

/// One condition the signal UI can produce.
#[derive(Debug, Clone, PartialEq)]
pub enum TriggerCondition {
    /// "Trace has span with name" — matched against the CURRENT batch's spans.
    SpanName {
        name: String,
        /// `false` for the `ne` operator the UI's operator dropdown allows.
        expect_present: bool,
    },
    /// "Status" — the UI offers only the `error` value, with eq/ne. Resolved
    /// from the cross-batch `seen_error` flag.
    IsError { expect_error: bool },
    /// "Root span finished" — true once the current batch carries the trace's
    /// root span.
    ///
    /// The operator and value are deliberately DISCARDED: the previous
    /// evaluator was `"root_span_finished" => self.top_span_id.is_some()`, so a
    /// stored `ne`/`false` already behaved as `eq true`. Preserved verbatim so
    /// existing triggers keep their current semantics.
    RootSpanFinished,
    /// "Total tokens" — numeric compare against the cross-batch running total.
    TotalTokens {
        operator: FilterOperator,
        value: Value,
    },
}

impl TriggerCondition {
    /// Parse a stored filter, or `None` when it isn't one of the four
    /// UI-producible conditions.
    pub fn parse(filter: &Filter) -> Option<Self> {
        match filter.column.as_str() {
            "span_name" => {
                let name = filter.value.as_str()?.to_string();
                match filter.operator {
                    FilterOperator::Eq => Some(Self::SpanName {
                        name,
                        expect_present: true,
                    }),
                    FilterOperator::Ne => Some(Self::SpanName {
                        name,
                        expect_present: false,
                    }),
                    _ => None,
                }
            }
            // The UI's only enum option is "error"; a filter naming any other
            // status is not something the UI can build, so don't guess at it.
            "status" if filter.value.as_str() == Some("error") => match filter.operator {
                FilterOperator::Eq => Some(Self::IsError { expect_error: true }),
                FilterOperator::Ne => Some(Self::IsError {
                    expect_error: false,
                }),
                _ => None,
            },
            "root_span_finished" => Some(Self::RootSpanFinished),
            "total_token_count" => Some(Self::TotalTokens {
                operator: filter.operator.clone(),
                value: filter.value.clone(),
            }),
            _ => None,
        }
    }

    fn matches(
        &self,
        state: &TraceTriggerState,
        batch_span_names: &HashSet<&str>,
        batch_has_root_span: bool,
    ) -> bool {
        match self {
            Self::SpanName {
                name,
                expect_present,
            } => batch_span_names.contains(name.as_str()) == *expect_present,
            Self::IsError { expect_error } => state.seen_error == *expect_error,
            Self::RootSpanFinished => batch_has_root_span,
            Self::TotalTokens { operator, value } => {
                evaluate_number_filter(state.total_tokens as f64, operator, value)
            }
        }
    }
}

/// Evaluate a trigger's filters (AND) for one trace.
///
/// Returns `false` for an empty filter list (a trigger with no conditions must
/// not fire on every trace) and for any filter outside the hard-coded set.
pub fn matches_trigger(
    filters: &[Filter],
    state: &TraceTriggerState,
    batch_span_names: &HashSet<&str>,
    batch_has_root_span: bool,
) -> bool {
    if filters.is_empty() {
        return false;
    }

    filters.iter().all(|filter| {
        match TriggerCondition::parse(filter) {
            Some(condition) => condition.matches(state, batch_span_names, batch_has_root_span),
            None => {
                log::warn!(
                    "Signal trigger filter is not a supported condition, so the trigger \
                     cannot fire: column={} operator={:?}",
                    filter.column,
                    filter.operator
                );
                false
            }
        }
    })
}

/// One trace's candidacy for signal evaluation in THIS batch.
///
/// Replaces the cumulative `Trace` row that used to be read back per batch: it
/// carries only what the hard-coded conditions read — the batch-local facts
/// (span names, whether the root span landed) plus the cross-batch cache state.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
#[derive(Debug, Clone)]
pub struct TraceTriggerCandidate {
    pub trace_id: Uuid,
    pub project_id: Uuid,
    /// `Into<u8> for TraceType`; signals only evaluate DEFAULT traces.
    pub trace_type: u8,
    pub state: TraceTriggerState,
    batch_span_names: Vec<String>,
    batch_has_root_span: bool,
}

#[cfg_attr(not(feature = "signals"), allow(dead_code))]
impl TraceTriggerCandidate {
    /// Build from one batch's aggregation plus the folded cache state.
    pub fn new(agg: &TraceAggregation, state: TraceTriggerState) -> Self {
        Self {
            trace_id: agg.trace_id,
            project_id: agg.project_id,
            trace_type: agg.trace_type,
            state,
            batch_span_names: agg.span_names.iter().cloned().collect(),
            // `TraceAggregation::from_spans` sets `top_span_id` only from a span
            // with no parent, i.e. exactly when this batch carried the root.
            batch_has_root_span: agg.top_span_id.is_some(),
        }
    }

    pub fn matches_filters(&self, filters: &[Filter]) -> bool {
        let names: HashSet<&str> = self.batch_span_names.iter().map(String::as_str).collect();
        matches_trigger(filters, &self.state, &names, self.batch_has_root_span)
    }

    /// The trace's user id for per-user sampling. Comes from the cross-batch
    /// state, NOT this batch's aggregation: `TraceAggregation::user_id` is only
    /// populated from spans in the current batch, so a trace whose user id
    /// arrived earlier would otherwise be sampled against the empty-user
    /// factor.
    pub fn user_id(&self) -> &Option<String> {
        &self.state.user_id
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn filter(column: &str, operator: FilterOperator, value: Value) -> Filter {
        Filter {
            column: column.to_string(),
            operator,
            value,
        }
    }

    fn names(list: &[&'static str]) -> HashSet<&'static str> {
        list.iter().copied().collect()
    }

    #[test]
    fn default_seeded_trigger_fires_once_tokens_and_root_are_present() {
        // `DEFAULT_SIGNAL_TRIGGER_VALUE` in frontend/lib/db/default-signals.ts.
        // Note the value is a STRING, not a number.
        let filters = vec![
            filter("total_token_count", FilterOperator::Gt, json!("1000")),
            filter("root_span_finished", FilterOperator::Eq, json!("true")),
        ];
        let state = TraceTriggerState {
            seen_error: false,
            total_tokens: 1500,
            user_id: None,
        };

        assert!(matches_trigger(&filters, &state, &names(&[]), true));
        // Root span in an earlier batch: this batch doesn't re-fire. Acceptable
        // because the trigger lock already caps firing at once per trace.
        assert!(!matches_trigger(&filters, &state, &names(&[]), false));
        // Tokens still under the threshold.
        let low = TraceTriggerState {
            seen_error: false,
            total_tokens: 10,
            user_id: None,
        };
        assert!(!matches_trigger(&filters, &low, &names(&[]), true));
    }

    #[test]
    fn span_name_matches_current_batch_only() {
        let filters = vec![filter("span_name", FilterOperator::Eq, json!("GitHub"))];
        let state = TraceTriggerState::default();

        assert!(matches_trigger(
            &filters,
            &state,
            &names(&["root", "GitHub"]),
            false
        ));
        assert!(!matches_trigger(&filters, &state, &names(&["root"]), false));
    }

    #[test]
    fn span_name_ne_inverts() {
        let filters = vec![filter("span_name", FilterOperator::Ne, json!("GitHub"))];
        let state = TraceTriggerState::default();

        assert!(matches_trigger(&filters, &state, &names(&["root"]), false));
        assert!(!matches_trigger(&filters, &state, &names(&["GitHub"]), false));
    }

    #[test]
    fn status_reads_cross_batch_seen_error() {
        let is_error = vec![filter("status", FilterOperator::Eq, json!("error"))];
        let not_error = vec![filter("status", FilterOperator::Ne, json!("error"))];

        let errored = TraceTriggerState {
            seen_error: true,
            total_tokens: 0,
            user_id: None,
        };
        let clean = TraceTriggerState::default();

        assert!(matches_trigger(&is_error, &errored, &names(&[]), false));
        assert!(!matches_trigger(&is_error, &clean, &names(&[]), false));
        // `status != error` must stay false once ANY earlier batch errored,
        // which is exactly why seen_error is cached across batches.
        assert!(!matches_trigger(&not_error, &errored, &names(&[]), false));
        assert!(matches_trigger(&not_error, &clean, &names(&[]), false));
    }

    #[test]
    fn root_span_finished_ignores_operator_and_value() {
        // Preserves the pre-LAM-2020 evaluator, which read only
        // `top_span_id.is_some()` and never looked at operator/value.
        let eq = vec![filter("root_span_finished", FilterOperator::Eq, json!("true"))];
        let ne = vec![filter(
            "root_span_finished",
            FilterOperator::Ne,
            json!("true"),
        )];
        let state = TraceTriggerState::default();

        assert!(matches_trigger(&eq, &state, &names(&[]), true));
        assert!(matches_trigger(&ne, &state, &names(&[]), true));
        assert!(!matches_trigger(&eq, &state, &names(&[]), false));
        assert!(!matches_trigger(&ne, &state, &names(&[]), false));
    }

    #[test]
    fn unsupported_columns_never_fire() {
        let state = TraceTriggerState {
            seen_error: true,
            total_tokens: 10_000,
            user_id: None,
        };
        // Legacy columns the UI can no longer emit, plus a hand-crafted one.
        for column in [
            "cost",
            "num_spans",
            "tags",
            "session_id",
            "user_id",
            "top_span_name",
            "input_token_count",
            "totally_made_up",
        ] {
            let filters = vec![filter(column, FilterOperator::Eq, json!("x"))];
            assert!(
                !matches_trigger(&filters, &state, &names(&["root"]), true),
                "column {column} must not fire"
            );
        }
    }

    #[test]
    fn one_unsupported_filter_blocks_the_whole_trigger() {
        let filters = vec![
            filter("root_span_finished", FilterOperator::Eq, json!("true")),
            filter("cost", FilterOperator::Gt, json!("1")),
        ];
        let state = TraceTriggerState::default();
        assert!(!matches_trigger(&filters, &state, &names(&[]), true));
    }

    #[test]
    fn status_with_a_non_error_value_is_not_supported() {
        // The UI's status dropdown only offers "error"; a `success` filter is
        // not producible, so don't invent semantics for it.
        let filters = vec![filter("status", FilterOperator::Eq, json!("success"))];
        let state = TraceTriggerState::default();
        assert!(!matches_trigger(&filters, &state, &names(&[]), true));
    }

    #[test]
    fn empty_filters_never_fire() {
        assert!(!matches_trigger(
            &[],
            &TraceTriggerState::default(),
            &names(&[]),
            true
        ));
    }

    #[test]
    fn total_tokens_accepts_numeric_and_string_values() {
        let state = TraceTriggerState {
            seen_error: false,
            total_tokens: 500,
            user_id: None,
        };
        for value in [json!(100), json!("100")] {
            let filters = vec![filter("total_token_count", FilterOperator::Gt, value)];
            assert!(matches_trigger(&filters, &state, &names(&[]), false));
        }
    }
}
