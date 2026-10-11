//! ATIF trajectory → Laminar spans. Mirrors the Harbor plugin's converter
//! (`lmnr-python` `integrations/harbor/trajectory.py`) so a trajectory looks
//! the same whether the SDK replays it or this endpoint ingests it:
//!
//! - every agent step that made an LLM call is an LLM span whose input is the
//!   conversation so far and whose output is the assistant message, running
//!   from the previous step's timestamp to this step's;
//! - every tool call is a TOOL span at the step's timestamp, with the
//!   subagent trajectories it spawned nested under it;
//! - siblings that would tie are nudged apart by [`ORDER_GAP_NS`].
//!
//! Each LLM span's input repeats the whole history, so materialising them
//! all up front is O(steps²) memory. Spans instead keep a [`HistoryRef`] into
//! shared history segments, and [`ConvertedTrajectory::into_spans`] builds
//! each input only when its span is consumed.

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, NaiveDateTime, Utc};
use serde_json::{Map, Value, json};
use uuid::Uuid;

use super::schema::{Content, ContentPart, ObservationResult, Step, StepSource, Trajectory};
use crate::{
    db::spans::{Span, SpanType},
    traces::{
        span_attributes::{
            ASSOCIATION_PROPERTIES_PREFIX, GEN_AI_CACHE_READ_INPUT_TOKENS, GEN_AI_INPUT_TOKENS,
            GEN_AI_OUTPUT_TOKENS, GEN_AI_REQUEST_MODEL, GEN_AI_RESPONSE_MODEL, GEN_AI_SYSTEM,
            GEN_AI_TOTAL_COST, SPAN_IDS_PATH, SPAN_PATH,
        },
        spans::SpanAttributes,
    },
};

/// ATIF gives a step's LLM call, its tool calls and the next LLM call the
/// same timestamp, and the trace view orders siblings at millisecond
/// precision.
const ORDER_GAP_NS: i64 = 1_000_000;
/// Guards against reference cycles between subagent trajectories.
const MAX_SUBAGENT_DEPTH: usize = 8;
const TOOL_DEFINITIONS: &str = "gen_ai.tool.definitions";
const TOTAL_TOKENS: &str = "llm.usage.total_tokens";
const ROOT_SCOPE: &str = "root";

/// Existing span to nest the trajectory under. `path` and `ids_path` are the
/// parent's own `lmnr.span.path` / `lmnr.span.ids_path`, same length.
pub struct ParentSpan {
    pub span_id: Uuid,
    pub path: Vec<String>,
    pub ids_path: Vec<String>,
}

pub struct ConvertOptions {
    pub project_id: Uuid,
    pub trace_id: Uuid,
    /// Without a parent the trajectory gets its own root span.
    pub parent: Option<ParentSpan>,
    pub session_id: Option<String>,
    pub user_id: Option<String>,
    pub metadata: Map<String, Value>,
    /// Time base for a trajectory that carries no timestamps at all.
    pub received_at: DateTime<Utc>,
}

pub struct ConvertedTrajectory {
    spans: Vec<PendingSpan>,
    history_segments: Vec<Vec<Value>>,
    tool_sets: Vec<Value>,
}

impl ConvertedTrajectory {
    pub fn span_count(&self) -> usize {
        self.spans.len()
    }

    pub fn into_spans(self) -> impl Iterator<Item = Span> {
        let Self {
            spans,
            history_segments,
            tool_sets,
        } = self;
        spans
            .into_iter()
            .map(move |pending| pending.materialize(&history_segments, &tool_sets))
    }
}

/// An LLM span's input: the first `len` messages of a history segment. A new
/// segment starts per trajectory and at every context-replacing step.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct HistoryRef {
    segment: usize,
    len: usize,
}

struct PendingSpan {
    span: Span,
    history: Option<HistoryRef>,
    /// Index into `tool_sets`; inserted as `gen_ai.tool.definitions`.
    tools: Option<usize>,
}

impl PendingSpan {
    fn materialize(self, history_segments: &[Vec<Value>], tool_sets: &[Value]) -> Span {
        let mut span = self.span;
        if let Some(history) = self.history {
            span.input = Some(Value::Array(
                history_segments[history.segment][..history.len].to_vec(),
            ));
        }
        if let Some(tools) = self.tools {
            span.attributes
                .raw_attributes
                .insert(TOOL_DEFINITIONS.to_string(), tool_sets[tools].clone());
        }
        span
    }

    fn start_ns(&self) -> i64 {
        self.span.start_time.timestamp_nanos_opt().unwrap_or(0)
    }

    fn end_ns(&self) -> i64 {
        self.span.end_time.timestamp_nanos_opt().unwrap_or(0)
    }
}

/// Where new spans attach: their parent and the parent's path. A span's own
/// path is its placement's path plus itself.
#[derive(Clone, Default)]
struct Placement {
    parent_span_id: Option<Uuid>,
    path: Vec<String>,
    ids_path: Vec<String>,
}

impl Placement {
    fn child(&self, span_id: Uuid, name: &str) -> Placement {
        let mut path = self.path.clone();
        path.push(name.to_string());
        let mut ids_path = self.ids_path.clone();
        ids_path.push(span_id.to_string());
        Placement {
            parent_span_id: Some(span_id),
            path,
            ids_path,
        }
    }
}

/// One trajectory being emitted — the root or a subagent.
struct Level<'t> {
    trajectory: &'t Trajectory,
    /// Stable id key prefix of this trajectory's spans.
    scope: String,
    depth: usize,
    placement: Placement,
    /// Embedded subagents by `trajectory_id`: inherited from ancestors plus
    /// this trajectory's own.
    subagents: HashMap<&'t str, &'t Trajectory>,
    tools: Option<usize>,
}

/// Latest sibling start and latest tool end at one level, to keep sibling
/// start times in trajectory order.
#[derive(Default)]
struct SiblingOrder {
    last_start: Option<i64>,
    tools_end: Option<i64>,
}

impl SiblingOrder {
    fn after_last_start(&self, ns: i64) -> i64 {
        not_before(ns, self.last_start.map(|t| t + ORDER_GAP_NS))
    }

    /// The next LLM call also waits for the previous step's tools.
    fn llm_start(&self, ns: i64) -> i64 {
        not_before(
            self.after_last_start(ns),
            self.tools_end.map(|t| t + ORDER_GAP_NS),
        )
    }

    fn record_start(&mut self, ns: i64) {
        self.last_start = Some(not_before(ns, self.last_start));
    }

    fn record_tool(&mut self, start: i64, end: i64) {
        self.record_start(start);
        self.tools_end = Some(not_before(end, self.tools_end));
    }
}

/// A subagent trajectory a step spawned, with its own time range.
struct Spawn<'t> {
    trajectory: &'t Trajectory,
    start_ns: i64,
    end_ns: i64,
}

#[derive(Default)]
struct Spawns<'t> {
    resolved: Vec<Spawn<'t>>,
    /// File-ref subagents; the files stay on the producer's disk.
    unresolved_paths: Vec<String>,
}

struct ModelName<'a> {
    provider: Option<&'a str>,
    model: Option<&'a str>,
}

struct SpanDraft {
    span_id: Uuid,
    name: String,
    span_type: SpanType,
    start_ns: i64,
    end_ns: i64,
    input: Option<Value>,
    output: Option<Value>,
    attributes: HashMap<String, Value>,
}

struct Converter<'o> {
    options: &'o ConvertOptions,
    /// Span ids are UUIDv5 under this namespace, so re-sending a trajectory
    /// to the same trace or parent reproduces the same ids.
    namespace: Uuid,
    spans: Vec<PendingSpan>,
    history_segments: Vec<Vec<Value>>,
    tool_sets: Vec<Value>,
}

pub fn convert_trajectory(
    trajectory: &Trajectory,
    options: &ConvertOptions,
) -> ConvertedTrajectory {
    let namespace = options
        .parent
        .as_ref()
        .map(|parent| parent.span_id)
        .unwrap_or(options.trace_id);
    let mut converter = Converter {
        options,
        namespace,
        spans: Vec::new(),
        history_segments: Vec::new(),
        tool_sets: Vec::new(),
    };
    let received_at_ns = options.received_at.timestamp_nanos_opt().unwrap_or(0);
    let base_ns = time_range(trajectory)
        .map(|(start, _)| start)
        .unwrap_or(received_at_ns);

    match &options.parent {
        Some(parent) => {
            let placement = Placement {
                parent_span_id: Some(parent.span_id),
                path: parent.path.clone(),
                ids_path: parent.ids_path.clone(),
            };
            let level = converter.level(trajectory, ROOT_SCOPE.to_string(), 0, placement, None);
            converter.emit_steps(&level, base_ns);
            let metadata = converter.metadata_attributes();
            if let Some(first) = converter.spans.first_mut() {
                first.span.attributes.raw_attributes.extend(metadata);
            }
        }
        None => converter.emit_root(trajectory, base_ns),
    }

    ConvertedTrajectory {
        spans: converter.spans,
        history_segments: converter.history_segments,
        tool_sets: converter.tool_sets,
    }
}

impl<'t, 'o> Converter<'o> {
    fn span_id(&self, key: &str) -> Uuid {
        Uuid::new_v5(&self.namespace, key.as_bytes())
    }

    fn new_history_segment(&mut self) -> usize {
        self.history_segments.push(Vec::new());
        self.history_segments.len() - 1
    }

    fn level(
        &mut self,
        trajectory: &'t Trajectory,
        scope: String,
        depth: usize,
        placement: Placement,
        inherited: Option<&HashMap<&'t str, &'t Trajectory>>,
    ) -> Level<'t> {
        let mut subagents = inherited.cloned().unwrap_or_default();
        for sub in &trajectory.subagent_trajectories {
            if let Some(id) = sub.trajectory_id.as_deref() {
                subagents.insert(id, sub);
            }
        }
        let tools = match trajectory.agent.tool_definitions.as_ref() {
            Some(definitions) if !definitions.is_empty() => {
                self.tool_sets.push(Value::Array(definitions.clone()));
                Some(self.tool_sets.len() - 1)
            }
            _ => None,
        };
        Level {
            trajectory,
            scope,
            depth,
            placement,
            subagents,
            tools,
        }
    }

    fn emit_root(&mut self, trajectory: &'t Trajectory, base_ns: i64) {
        let span_id = self.span_id(ROOT_SCOPE);
        let name = trajectory.agent.name.clone().unwrap_or("agent".to_string());
        let top = Placement::default();
        let level = self.level(
            trajectory,
            ROOT_SCOPE.to_string(),
            0,
            top.child(span_id, &name),
            None,
        );
        self.emit_steps(&level, base_ns);

        let start_ns = self
            .spans
            .iter()
            .map(PendingSpan::start_ns)
            .fold(base_ns, i64::min);
        let end_ns = self
            .spans
            .iter()
            .map(PendingSpan::end_ns)
            .fold(base_ns, i64::max);
        let mut attributes = trajectory_attributes(trajectory);
        attributes.extend(self.metadata_attributes());
        let root = self.pending_span(
            &top,
            SpanDraft {
                span_id,
                name,
                span_type: SpanType::Default,
                start_ns,
                end_ns,
                input: Some(trajectory_input(trajectory)),
                output: trajectory_output(trajectory),
                attributes,
            },
        );
        self.spans.insert(0, root);
    }

    fn emit_steps(&mut self, level: &Level<'t>, start_ns: i64) {
        let mut order = SiblingOrder::default();
        let mut segment = self.new_history_segment();
        let mut prev_ns = start_ns;
        for (i, step) in level.trajectory.steps.iter().enumerate() {
            let step_ns = step
                .timestamp
                .as_deref()
                .and_then(parse_timestamp_ns)
                .unwrap_or(prev_ns);
            let step_scope = format!("{}/step:{i}", level.scope);
            let live_agent_step = step.source == StepSource::Agent && !step.is_copied_context();

            if live_agent_step && step.llm_call_count != Some(0) {
                let llm_start = order.llm_start(prev_ns);
                let history = HistoryRef {
                    segment,
                    len: self.history_segments[segment].len(),
                };
                self.emit_llm_span(
                    level,
                    step,
                    &step_scope,
                    history,
                    llm_start,
                    step_ns.max(llm_start),
                );
                order.record_start(llm_start);
            }
            if live_agent_step && !step.tool_calls.is_empty() {
                self.emit_tool_spans(level, step, &step_scope, step_ns, &mut order);
            } else if !step.is_copied_context() {
                // Subagents spawned outside a tool call, e.g. by a compaction
                // system step, hang directly off the trajectory.
                self.emit_direct_subagents(level, step, &step_scope, step_ns, &mut order);
            }

            if step.replaces_context() {
                segment = self.new_history_segment();
                self.history_segments[segment].extend(observation_messages(step));
            } else {
                self.history_segments[segment].extend(step_messages(step));
            }
            prev_ns = step_ns;
        }
    }

    fn emit_llm_span(
        &mut self,
        level: &Level<'t>,
        step: &Step,
        step_scope: &str,
        history: HistoryRef,
        start_ns: i64,
        end_ns: i64,
    ) {
        let default_model = level.trajectory.agent.model_name.as_deref();
        let model_name = split_model_name(step.model_name.as_deref().or(default_model));
        // Agents like terminus-2 record the bare model the API returned; the
        // agent's `provider/model` has the provider.
        let provider = model_name
            .provider
            .or(split_model_name(default_model).provider);

        let mut attributes = HashMap::new();
        insert_str(&mut attributes, GEN_AI_SYSTEM, provider);
        insert_str(&mut attributes, GEN_AI_REQUEST_MODEL, model_name.model);
        insert_str(&mut attributes, GEN_AI_RESPONSE_MODEL, model_name.model);
        if let Some(metrics) = step.metrics.as_ref() {
            insert_value(
                &mut attributes,
                GEN_AI_INPUT_TOKENS,
                metrics.prompt_tokens.map(Value::from),
            );
            insert_value(
                &mut attributes,
                GEN_AI_OUTPUT_TOKENS,
                metrics.completion_tokens.map(Value::from),
            );
            if metrics.prompt_tokens.is_some() || metrics.completion_tokens.is_some() {
                let total =
                    metrics.prompt_tokens.unwrap_or(0) + metrics.completion_tokens.unwrap_or(0);
                attributes.insert(TOTAL_TOKENS.to_string(), Value::from(total));
            }
            insert_value(
                &mut attributes,
                GEN_AI_CACHE_READ_INPUT_TOKENS,
                metrics.cached_tokens.map(Value::from),
            );
            insert_value(
                &mut attributes,
                GEN_AI_TOTAL_COST,
                metrics.cost_usd.map(Value::from),
            );
        }
        insert_value(&mut attributes, "atif.step_id", step.step_id.clone());
        insert_value(
            &mut attributes,
            "atif.llm_call_count",
            step.llm_call_count.map(Value::from),
        );
        insert_value(
            &mut attributes,
            "atif.reasoning_effort",
            step.reasoning_effort.clone(),
        );

        let draft = SpanDraft {
            span_id: self.span_id(step_scope),
            name: model_name.model.unwrap_or("llm").to_string(),
            span_type: SpanType::LLM,
            start_ns,
            end_ns,
            input: None,
            output: Some(Value::Array(vec![assistant_message(step)])),
            attributes,
        };
        let mut pending = self.pending_span(&level.placement, draft);
        pending.history = Some(history);
        pending.tools = level.tools;
        self.spans.push(pending);
    }

    fn emit_tool_spans(
        &mut self,
        level: &Level<'t>,
        step: &'t Step,
        step_scope: &str,
        step_ns: i64,
        order: &mut SiblingOrder,
    ) {
        let call_ids: HashSet<&str> = step
            .tool_calls
            .iter()
            .filter_map(|call| call.tool_call_id.as_deref())
            .collect();
        let last_call = step.tool_calls.len() - 1;

        for (j, call) in step.tool_calls.iter().enumerate() {
            // Results without a known call id (e.g. terminus-2's one terminal
            // observation per step) are what the step's last call left.
            let results: Vec<&'t ObservationResult> = step
                .results()
                .iter()
                .filter(|result| match result.source_call_id.as_deref() {
                    Some(id) if call_ids.contains(id) => call.tool_call_id.as_deref() == Some(id),
                    _ => j == last_call,
                })
                .collect();
            let spawns = self.spawns(level, &results, step_ns);

            let earliest = spawns
                .resolved
                .iter()
                .map(|spawn| spawn.start_ns)
                .fold(step_ns, i64::min);
            let start_ns = order.after_last_start(earliest);
            let tool_scope = format!("{step_scope}/tool:{j}");
            let span_id = self.span_id(&tool_scope);
            let name = call.function_name.clone().unwrap_or("tool".to_string());
            let children = level.placement.child(span_id, &name);

            let mut end_ns = spawns
                .resolved
                .iter()
                .map(|spawn| spawn.end_ns)
                .fold(step_ns, i64::max)
                .max(start_ns);
            for (k, spawn) in spawns.resolved.iter().enumerate() {
                let sub_start = spawn.start_ns.max(start_ns);
                let sub_end = self.emit_subagent(
                    level,
                    spawn.trajectory,
                    format!("{tool_scope}/sub:{k}"),
                    &children,
                    sub_start,
                    spawn.end_ns.max(sub_start),
                );
                end_ns = end_ns.max(sub_end);
            }

            let mut attributes = HashMap::new();
            insert_str(
                &mut attributes,
                "atif.tool_call_id",
                call.tool_call_id.as_deref(),
            );
            if !spawns.unresolved_paths.is_empty() {
                attributes.insert(
                    "atif.subagent_trajectory_paths".to_string(),
                    json!(spawns.unresolved_paths),
                );
            }
            let output = (!results.is_empty()).then(|| {
                Value::String(
                    results
                        .iter()
                        .map(|result| {
                            result
                                .content
                                .as_ref()
                                .map(content_text)
                                .unwrap_or_default()
                        })
                        .collect::<Vec<_>>()
                        .join("\n"),
                )
            });
            let span = self.pending_span(
                &level.placement,
                SpanDraft {
                    span_id,
                    name,
                    span_type: SpanType::Tool,
                    start_ns,
                    end_ns,
                    input: Some(call.arguments.clone().unwrap_or(json!({}))),
                    output,
                    attributes,
                },
            );
            self.spans.push(span);
            order.record_tool(start_ns, end_ns);
        }
    }

    fn emit_direct_subagents(
        &mut self,
        level: &Level<'t>,
        step: &'t Step,
        step_scope: &str,
        step_ns: i64,
        order: &mut SiblingOrder,
    ) {
        let results: Vec<&'t ObservationResult> = step.results().iter().collect();
        let spawns = self.spawns(level, &results, step_ns);
        for (k, spawn) in spawns.resolved.iter().enumerate() {
            let start_ns = order.after_last_start(spawn.start_ns);
            let end_ns = self.emit_subagent(
                level,
                spawn.trajectory,
                format!("{step_scope}/sub:{k}"),
                &level.placement,
                start_ns,
                spawn.end_ns.max(start_ns),
            );
            order.record_tool(start_ns, end_ns);
        }
    }

    /// Returns the subagent span's end, which covers its children.
    fn emit_subagent(
        &mut self,
        parent: &Level<'t>,
        trajectory: &'t Trajectory,
        scope: String,
        placement: &Placement,
        start_ns: i64,
        end_ns: i64,
    ) -> i64 {
        let span_id = self.span_id(&scope);
        let name = trajectory
            .agent
            .name
            .clone()
            .unwrap_or("subagent".to_string());
        let level = self.level(
            trajectory,
            scope,
            parent.depth + 1,
            placement.child(span_id, &name),
            Some(&parent.subagents),
        );
        let first_child = self.spans.len();
        self.emit_steps(&level, start_ns);
        let end_ns = self.spans[first_child..]
            .iter()
            .map(PendingSpan::end_ns)
            .fold(end_ns, i64::max);

        let span = self.pending_span(
            placement,
            SpanDraft {
                span_id,
                name,
                span_type: SpanType::Default,
                start_ns,
                end_ns,
                input: Some(trajectory_input(trajectory)),
                output: trajectory_output(trajectory),
                attributes: trajectory_attributes(trajectory),
            },
        );
        self.spans.push(span);
        end_ns
    }

    fn spawns(
        &self,
        level: &Level<'t>,
        results: &[&'t ObservationResult],
        step_ns: i64,
    ) -> Spawns<'t> {
        let mut spawns = Spawns::default();
        for result in results {
            for subagent_ref in &result.subagent_trajectory_ref {
                let embedded = subagent_ref
                    .trajectory_id
                    .as_deref()
                    .and_then(|id| level.subagents.get(id));
                match (embedded, subagent_ref.trajectory_path.as_ref()) {
                    (Some(_), _) if level.depth >= MAX_SUBAGENT_DEPTH => {
                        log::debug!("Skipping ATIF subagent trajectory: nested too deeply");
                    }
                    (Some(trajectory), _) => {
                        let range = time_range(trajectory);
                        spawns.resolved.push(Spawn {
                            trajectory,
                            start_ns: range.map(|(start, _)| start).unwrap_or(step_ns),
                            end_ns: range.map(|(_, end)| end).unwrap_or(step_ns),
                        });
                    }
                    (None, Some(path)) => spawns.unresolved_paths.push(path.clone()),
                    (None, None) => {}
                }
            }
        }
        spawns
    }

    fn pending_span(&self, placement: &Placement, draft: SpanDraft) -> PendingSpan {
        let own = placement.child(draft.span_id, &draft.name);
        let mut attributes = draft.attributes;
        attributes.insert(SPAN_PATH.to_string(), json!(own.path));
        attributes.insert(SPAN_IDS_PATH.to_string(), json!(own.ids_path));
        insert_str(
            &mut attributes,
            &format!("{ASSOCIATION_PROPERTIES_PREFIX}.session_id"),
            self.options.session_id.as_deref(),
        );
        insert_str(
            &mut attributes,
            &format!("{ASSOCIATION_PROPERTIES_PREFIX}.user_id"),
            self.options.user_id.as_deref(),
        );
        PendingSpan {
            span: Span {
                span_id: draft.span_id,
                trace_id: self.options.trace_id,
                project_id: self.options.project_id,
                parent_span_id: placement.parent_span_id,
                name: draft.name,
                attributes: SpanAttributes::new(attributes),
                input: draft.input,
                output: draft.output,
                span_type: draft.span_type,
                start_time: DateTime::from_timestamp_nanos(draft.start_ns),
                end_time: DateTime::from_timestamp_nanos(draft.end_ns),
                status: None,
                events: vec![],
                tags: None,
                size_bytes: 0,
            },
            history: None,
            tools: None,
        }
    }

    fn metadata_attributes(&self) -> HashMap<String, Value> {
        self.options
            .metadata
            .iter()
            .map(|(key, value)| {
                (
                    format!("{ASSOCIATION_PROPERTIES_PREFIX}.metadata.{key}"),
                    value.clone(),
                )
            })
            .collect()
    }
}

fn trajectory_attributes(trajectory: &Trajectory) -> HashMap<String, Value> {
    let agent = &trajectory.agent;
    let mut attributes = HashMap::new();
    insert_str(
        &mut attributes,
        "atif.schema_version",
        trajectory.schema_version.as_deref(),
    );
    insert_str(&mut attributes, "atif.agent.name", agent.name.as_deref());
    insert_str(
        &mut attributes,
        "atif.agent.version",
        agent.version.as_deref(),
    );
    insert_str(
        &mut attributes,
        "atif.agent.model_name",
        agent.model_name.as_deref(),
    );
    insert_value(&mut attributes, "atif.agent.extra", agent.extra.clone());
    insert_str(
        &mut attributes,
        "atif.session_id",
        trajectory.session_id.as_deref(),
    );
    insert_str(
        &mut attributes,
        "atif.trajectory_id",
        trajectory.trajectory_id.as_deref(),
    );
    insert_str(&mut attributes, "atif.notes", trajectory.notes.as_deref());
    insert_value(
        &mut attributes,
        "atif.final_metrics",
        trajectory.final_metrics.clone(),
    );
    insert_value(
        &mut attributes,
        "atif.continued_trajectory_ref",
        trajectory.continued_trajectory_ref.clone(),
    );
    insert_value(&mut attributes, "atif.extra", trajectory.extra.clone());
    attributes
}

/// The task: the first user message, else the trajectory's identity.
fn trajectory_input(trajectory: &Trajectory) -> Value {
    let first_user_message = trajectory
        .steps
        .iter()
        .find(|step| step.source == StepSource::User)
        .and_then(|step| step.message.as_ref())
        .map(content_value);
    let identity = trajectory
        .trajectory_id
        .as_ref()
        .or(trajectory.session_id.as_ref())
        .map(|id| Value::String(id.clone()));
    first_user_message.or(identity).unwrap_or(Value::Null)
}

/// The answer: the last non-empty agent message, else the final metrics.
fn trajectory_output(trajectory: &Trajectory) -> Option<Value> {
    trajectory
        .steps
        .iter()
        .rev()
        .filter(|step| step.source == StepSource::Agent)
        .filter_map(|step| step.message.as_ref())
        .map(content_text)
        .find(|text| !text.is_empty())
        .map(Value::String)
        .or(trajectory.final_metrics.clone())
}

/// Earliest and latest step timestamps.
fn time_range(trajectory: &Trajectory) -> Option<(i64, i64)> {
    let times = trajectory
        .steps
        .iter()
        .filter_map(|step| step.timestamp.as_deref().and_then(parse_timestamp_ns));
    times.fold(None, |range, t| match range {
        Some((start, end)) => Some((i64::min(start, t), i64::max(end, t))),
        None => Some((t, t)),
    })
}

/// ISO 8601; a timestamp without an offset is UTC.
fn parse_timestamp_ns(value: &str) -> Option<i64> {
    let parsed = DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .ok()
        .or_else(|| {
            NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.f")
                .ok()
                .map(|naive| naive.and_utc())
        });
    parsed.and_then(|dt| dt.timestamp_nanos_opt())
}

/// LiteLLM-style `provider/model`.
fn split_model_name(model_name: Option<&str>) -> ModelName<'_> {
    match model_name.filter(|name| !name.is_empty()) {
        Some(name) => match name.split_once('/') {
            Some((provider, model)) => ModelName {
                provider: Some(provider),
                model: Some(model),
            },
            None => ModelName {
                provider: None,
                model: Some(name),
            },
        },
        None => ModelName {
            provider: None,
            model: None,
        },
    }
}

fn not_before(value: i64, floor: Option<i64>) -> i64 {
    floor.map(|floor| value.max(floor)).unwrap_or(value)
}

fn insert_str(attributes: &mut HashMap<String, Value>, key: &str, value: Option<&str>) {
    if let Some(value) = value {
        attributes.insert(key.to_string(), Value::String(value.to_string()));
    }
}

fn insert_value(attributes: &mut HashMap<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value.filter(|value| !value.is_null()) {
        attributes.insert(key.to_string(), value);
    }
}

/// OpenAI-format messages a step adds to the conversation.
fn step_messages(step: &Step) -> Vec<Value> {
    let mut messages = Vec::new();
    match step.source {
        StepSource::Agent => messages.push(assistant_message(step)),
        StepSource::System => {
            messages.extend(step.message.as_ref().map(|m| role_message("system", m)))
        }
        StepSource::User | StepSource::Other => {
            messages.extend(step.message.as_ref().map(|m| role_message("user", m)))
        }
    }
    messages.extend(observation_messages(step));
    messages
}

fn role_message(role: &str, content: &Content) -> Value {
    json!({ "role": role, "content": content_value(content) })
}

/// What the agent saw after the step: tool results, or plain feedback.
fn observation_messages(step: &Step) -> Vec<Value> {
    step.results()
        .iter()
        .map(|result| {
            let content = result
                .content
                .as_ref()
                .map(content_value)
                .unwrap_or(Value::String(String::new()));
            match result.source_call_id.as_deref() {
                Some(call_id) => {
                    json!({ "role": "tool", "tool_call_id": call_id, "content": content })
                }
                None => json!({ "role": "user", "content": content }),
            }
        })
        .collect()
}

fn assistant_message(step: &Step) -> Value {
    let mut message = Map::new();
    message.insert("role".to_string(), json!("assistant"));
    message.insert(
        "content".to_string(),
        step.message
            .as_ref()
            .map(content_value)
            .unwrap_or(Value::String(String::new())),
    );
    if let Some(reasoning) = step.reasoning_content.as_ref().filter(|r| !r.is_empty()) {
        message.insert("reasoning_content".to_string(), json!(reasoning));
    }
    if !step.tool_calls.is_empty() {
        let tool_calls: Vec<Value> = step
            .tool_calls
            .iter()
            .map(|call| {
                let arguments = match call.arguments.as_ref() {
                    Some(Value::String(s)) => s.clone(),
                    Some(value) => value.to_string(),
                    None => "{}".to_string(),
                };
                json!({
                    "id": call.tool_call_id,
                    "type": "function",
                    "function": { "name": call.function_name, "arguments": arguments },
                })
            })
            .collect();
        message.insert("tool_calls".to_string(), Value::Array(tool_calls));
    }
    Value::Object(message)
}

/// Message content: a plain string when every part is text; otherwise
/// OpenAI content parts, with URL images kept and file media referenced by
/// path (the files stay on the producer's disk).
fn content_value(content: &Content) -> Value {
    match content {
        Content::Text(text) => Value::String(text.clone()),
        Content::Parts(parts) if parts.iter().all(is_text_part) => {
            Value::String(parts.iter().map(part_text).collect::<Vec<_>>().join("\n"))
        }
        Content::Parts(parts) => Value::Array(parts.iter().map(part_value).collect()),
        Content::Other(value) => Value::String(value.to_string()),
    }
}

/// Plain text, media referenced by path.
fn content_text(content: &Content) -> String {
    match content {
        Content::Text(text) => text.clone(),
        Content::Parts(parts) => parts.iter().map(part_text).collect::<Vec<_>>().join("\n"),
        Content::Other(value) => value.to_string(),
    }
}

fn is_text_part(part: &ContentPart) -> bool {
    match part.kind.as_deref() {
        Some("text") => true,
        Some(_) => false,
        None => part.source.is_none(),
    }
}

fn part_text(part: &ContentPart) -> String {
    if is_text_part(part) {
        return part.text.clone().unwrap_or_default();
    }
    format!(
        "[{}: {}]",
        part.kind.as_deref().unwrap_or("attachment"),
        part_path(part).unwrap_or("")
    )
}

fn part_value(part: &ContentPart) -> Value {
    let url = part_path(part).filter(|path| {
        path.starts_with("http://") || path.starts_with("https://") || path.starts_with("data:")
    });
    match (part.kind.as_deref(), url) {
        (Some("image"), Some(url)) => json!({ "type": "image_url", "image_url": { "url": url } }),
        _ => json!({ "type": "text", "text": part_text(part) }),
    }
}

fn part_path(part: &ContentPart) -> Option<&str> {
    part.source
        .as_ref()
        .and_then(|source| source.path.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    const T0: &str = "2025-01-01T00:00:00Z";
    const T1: &str = "2025-01-01T00:00:10Z";
    const T2: &str = "2025-01-01T00:00:20Z";
    const T3: &str = "2025-01-01T00:00:30Z";

    fn trajectory(value: Value) -> Trajectory {
        serde_json::from_value(value).unwrap()
    }

    fn options() -> ConvertOptions {
        ConvertOptions {
            project_id: Uuid::from_u128(1),
            trace_id: Uuid::from_u128(2),
            parent: None,
            session_id: None,
            user_id: None,
            metadata: Map::new(),
            received_at: DateTime::from_timestamp_nanos(0),
        }
    }

    fn convert(value: Value, options: &ConvertOptions) -> Vec<Span> {
        convert_trajectory(&trajectory(value), options)
            .into_spans()
            .collect()
    }

    fn ns(ts: &str) -> i64 {
        parse_timestamp_ns(ts).unwrap()
    }

    fn start(span: &Span) -> i64 {
        span.start_time.timestamp_nanos_opt().unwrap()
    }

    fn end(span: &Span) -> i64 {
        span.end_time.timestamp_nanos_opt().unwrap()
    }

    fn attr<'a>(span: &'a Span, key: &str) -> Option<&'a Value> {
        span.attributes.raw_attributes.get(key)
    }

    fn named<'a>(spans: &'a [Span], name: &str) -> Vec<&'a Span> {
        spans.iter().filter(|span| span.name == name).collect()
    }

    fn basic() -> Value {
        json!({
            "schema_version": "ATIF-v1.8",
            "session_id": "run-1",
            "agent": {
                "name": "terminus-2",
                "version": "1.0",
                "model_name": "anthropic/claude-sonnet-4-5",
                "tool_definitions": [{"type": "function", "function": {"name": "bash"}}]
            },
            "steps": [
                {"step_id": 1, "timestamp": T0, "source": "system", "message": "You are an agent."},
                {"step_id": 2, "timestamp": T0, "source": "user", "message": "List files."},
                {
                    "step_id": 3, "timestamp": T1, "source": "agent",
                    "model_name": "claude-sonnet-4-5",
                    "message": "Running ls.",
                    "reasoning_content": "Need to look around.",
                    "tool_calls": [{"tool_call_id": "c1", "function_name": "bash", "arguments": {"cmd": "ls"}}],
                    "observation": {"results": [{"source_call_id": "c1", "content": "a.txt"}]},
                    "metrics": {"prompt_tokens": 100, "completion_tokens": 20, "cached_tokens": 60, "cost_usd": 0.01}
                },
                {"step_id": 4, "timestamp": T2, "source": "agent", "message": "Found a.txt."}
            ],
            "final_metrics": {"total_steps": 4}
        })
    }

    #[test]
    fn converts_llm_and_tool_spans_under_a_root() {
        let spans = convert(basic(), &options());
        assert_eq!(spans.len(), 4);

        let root = &spans[0];
        assert_eq!(root.name, "terminus-2");
        assert_eq!(root.parent_span_id, None);
        assert_eq!(root.span_type, SpanType::Default);
        assert_eq!(root.input, Some(json!("List files.")));
        assert_eq!(root.output, Some(json!("Found a.txt.")));
        assert_eq!(attr(root, "atif.session_id"), Some(&json!("run-1")));
        assert_eq!(attr(root, SPAN_PATH), Some(&json!(["terminus-2"])));
        assert_eq!(start(root), ns(T0));
        assert_eq!(end(root), ns(T2));

        let llms = named(&spans, "claude-sonnet-4-5");
        assert_eq!(llms.len(), 2);
        let first = llms[0];
        assert_eq!(first.span_type, SpanType::LLM);
        assert_eq!(first.parent_span_id, Some(root.span_id));
        assert_eq!(attr(first, GEN_AI_SYSTEM), Some(&json!("anthropic")));
        assert_eq!(attr(first, GEN_AI_INPUT_TOKENS), Some(&json!(100)));
        assert_eq!(attr(first, TOTAL_TOKENS), Some(&json!(120)));
        assert_eq!(
            attr(first, GEN_AI_CACHE_READ_INPUT_TOKENS),
            Some(&json!(60))
        );
        assert_eq!(attr(first, GEN_AI_TOTAL_COST), Some(&json!(0.01)));
        assert_eq!(attr(first, "atif.step_id"), Some(&json!(3)));
        assert_eq!(
            attr(first, TOOL_DEFINITIONS),
            Some(&json!([{"type": "function", "function": {"name": "bash"}}]))
        );
        assert_eq!(
            attr(first, SPAN_PATH),
            Some(&json!(["terminus-2", "claude-sonnet-4-5"]))
        );
        assert_eq!(
            attr(first, SPAN_IDS_PATH),
            Some(&json!([
                root.span_id.to_string(),
                first.span_id.to_string()
            ]))
        );
        assert_eq!(
            first.input,
            Some(json!([
                {"role": "system", "content": "You are an agent."},
                {"role": "user", "content": "List files."}
            ]))
        );
        assert_eq!(
            first.output,
            Some(json!([{
                "role": "assistant",
                "content": "Running ls.",
                "reasoning_content": "Need to look around.",
                "tool_calls": [{
                    "id": "c1", "type": "function",
                    "function": {"name": "bash", "arguments": "{\"cmd\":\"ls\"}"}
                }]
            }]))
        );
        assert_eq!(start(first), ns(T0));
        assert_eq!(end(first), ns(T1));

        let tool = named(&spans, "bash")[0];
        assert_eq!(tool.span_type, SpanType::Tool);
        assert_eq!(tool.input, Some(json!({"cmd": "ls"})));
        assert_eq!(tool.output, Some(json!("a.txt")));
        assert_eq!(attr(tool, "atif.tool_call_id"), Some(&json!("c1")));

        // The next call sees the previous turn and its tool result.
        let second = llms[1];
        let input = second.input.as_ref().unwrap().as_array().unwrap();
        assert_eq!(input.len(), 4);
        assert_eq!(
            input[3],
            json!({"role": "tool", "tool_call_id": "c1", "content": "a.txt"})
        );
    }

    #[test]
    fn nudges_tied_siblings_into_trajectory_order() {
        let spans = convert(
            json!({
                "steps": [
                    {"timestamp": T0, "source": "user", "message": "go"},
                    {
                        "timestamp": T0, "source": "agent", "message": "",
                        "tool_calls": [
                            {"tool_call_id": "a", "function_name": "first"},
                            {"tool_call_id": "b", "function_name": "second"}
                        ]
                    },
                    {"timestamp": T0, "source": "agent", "message": "done"}
                ]
            }),
            &options(),
        );
        let llms = named(&spans, "llm");
        let first_tool = named(&spans, "first")[0];
        let second_tool = named(&spans, "second")[0];
        assert_eq!(start(llms[0]), ns(T0));
        assert_eq!(start(first_tool), ns(T0) + ORDER_GAP_NS);
        assert_eq!(start(second_tool), ns(T0) + 2 * ORDER_GAP_NS);
        assert_eq!(start(llms[1]), end(second_tool) + ORDER_GAP_NS);
    }

    #[test]
    fn unattributed_results_go_to_the_last_call() {
        let spans = convert(
            json!({
                "steps": [{
                    "timestamp": T0, "source": "agent",
                    "tool_calls": [
                        {"tool_call_id": "a", "function_name": "first"},
                        {"tool_call_id": "b", "function_name": "second"}
                    ],
                    "observation": {"results": [
                        {"source_call_id": "b", "content": "from b"},
                        {"content": "terminal"},
                        {"source_call_id": "zzz", "content": "orphan"}
                    ]}
                }]
            }),
            &options(),
        );
        assert_eq!(named(&spans, "first")[0].output, None);
        assert_eq!(
            named(&spans, "second")[0].output,
            Some(json!("from b\nterminal\norphan"))
        );
    }

    #[test]
    fn nests_embedded_subagents_under_their_tool_call() {
        let spans = convert(
            json!({
                "agent": {"name": "lead"},
                "steps": [
                    {"timestamp": T0, "source": "user", "message": "research"},
                    {
                        "timestamp": T1, "source": "agent",
                        "tool_calls": [{"tool_call_id": "c1", "function_name": "delegate"}],
                        "observation": {"results": [{
                            "source_call_id": "c1", "content": "summary",
                            "subagent_trajectory_ref": [
                                {"trajectory_id": "sub-1"},
                                {"trajectory_path": "subagents/other.json"}
                            ]
                        }]}
                    }
                ],
                "subagent_trajectories": [{
                    "trajectory_id": "sub-1",
                    "agent": {"name": "researcher", "model_name": "openai/gpt-4o"},
                    "steps": [
                        {"timestamp": T1, "source": "user", "message": "dig in"},
                        {"timestamp": T3, "source": "agent", "message": "found it"}
                    ]
                }]
            }),
            &options(),
        );
        let tool = named(&spans, "delegate")[0];
        let sub = named(&spans, "researcher")[0];
        let sub_llm = named(&spans, "gpt-4o")[0];
        assert_eq!(sub.parent_span_id, Some(tool.span_id));
        assert_eq!(sub_llm.parent_span_id, Some(sub.span_id));
        assert_eq!(attr(sub_llm, GEN_AI_SYSTEM), Some(&json!("openai")));
        assert_eq!(
            attr(sub_llm, SPAN_PATH),
            Some(&json!(["lead", "delegate", "researcher", "gpt-4o"]))
        );
        assert_eq!(sub.input, Some(json!("dig in")));
        assert_eq!(sub.output, Some(json!("found it")));
        assert_eq!(end(tool), ns(T3));
        assert_eq!(
            attr(tool, "atif.subagent_trajectory_paths"),
            Some(&json!(["subagents/other.json"]))
        );
        // The subagent's history starts fresh.
        assert_eq!(
            sub_llm.input,
            Some(json!([{"role": "user", "content": "dig in"}]))
        );
    }

    #[test]
    fn self_referencing_subagent_stops_at_max_depth() {
        let spans = convert(
            json!({
                "steps": [{
                    "timestamp": T0, "source": "agent",
                    "tool_calls": [{"tool_call_id": "c", "function_name": "spawn"}],
                    "observation": {"results": [{
                        "source_call_id": "c",
                        "subagent_trajectory_ref": [{"trajectory_id": "loop"}]
                    }]}
                }],
                "subagent_trajectories": [{
                    "trajectory_id": "loop",
                    "agent": {"name": "looper"},
                    "steps": [{
                        "timestamp": T0, "source": "agent", "llm_call_count": 0,
                        "tool_calls": [{"tool_call_id": "c", "function_name": "spawn"}],
                        "observation": {"results": [{
                            "source_call_id": "c",
                            "subagent_trajectory_ref": [{"trajectory_id": "loop"}]
                        }]}
                    }]
                }]
            }),
            &options(),
        );
        assert_eq!(named(&spans, "looper").len(), MAX_SUBAGENT_DEPTH);
    }

    #[test]
    fn context_replace_restarts_history_from_the_summary() {
        let spans = convert(
            json!({
                "steps": [
                    {"timestamp": T0, "source": "user", "message": "long task"},
                    {"timestamp": T1, "source": "agent", "message": "working"},
                    {
                        "timestamp": T2, "source": "system", "message": "Context compaction performed",
                        "observation": {"results": [{
                            "content": "Summary so far",
                            "subagent_trajectory_ref": [{"trajectory_id": "compact-1"}]
                        }]},
                        "extra": {"context_management": {"type": "compaction", "boundary": "replace"}}
                    },
                    {"timestamp": T3, "source": "agent", "message": "continuing"}
                ],
                "subagent_trajectories": [{
                    "trajectory_id": "compact-1",
                    "agent": {"name": "compactor"},
                    "steps": [{"timestamp": T2, "source": "agent", "message": "Summary so far"}]
                }]
            }),
            &options(),
        );
        let llms = named(&spans, "llm");
        let after = llms
            .iter()
            .find(|span| span.output.as_ref().unwrap()[0]["content"] == "continuing")
            .unwrap();
        assert_eq!(
            after.input,
            Some(json!([{"role": "user", "content": "Summary so far"}]))
        );
        let compactor = named(&spans, "compactor")[0];
        assert_eq!(compactor.parent_span_id, Some(spans[0].span_id));
    }

    #[test]
    fn nests_under_a_parent_span_without_a_root() {
        let parent_id = Uuid::from_u128(0xBEEF);
        let grandparent_id = Uuid::from_u128(0xCAFE);
        let mut metadata = Map::new();
        metadata.insert("task".to_string(), json!("hello-world"));
        let options = ConvertOptions {
            parent: Some(ParentSpan {
                span_id: parent_id,
                path: vec!["trial".to_string(), "agent".to_string()],
                ids_path: vec![grandparent_id.to_string(), parent_id.to_string()],
            }),
            session_id: Some("sess".to_string()),
            user_id: Some("user".to_string()),
            metadata,
            ..options()
        };
        let spans = convert(basic(), &options);
        assert_eq!(spans.len(), 3);
        assert!(
            spans
                .iter()
                .all(|span| span.parent_span_id == Some(parent_id))
        );
        assert!(named(&spans, "terminus-2").is_empty());
        let llm = named(&spans, "claude-sonnet-4-5")[0];
        assert_eq!(
            attr(llm, SPAN_PATH),
            Some(&json!(["trial", "agent", "claude-sonnet-4-5"]))
        );
        assert_eq!(
            attr(llm, SPAN_IDS_PATH),
            Some(&json!([
                grandparent_id.to_string(),
                parent_id.to_string(),
                llm.span_id.to_string()
            ]))
        );
        assert!(spans.iter().all(|span| {
            attr(span, "lmnr.association.properties.session_id") == Some(&json!("sess"))
                && attr(span, "lmnr.association.properties.user_id") == Some(&json!("user"))
        }));
        assert_eq!(
            attr(&spans[0], "lmnr.association.properties.metadata.task"),
            Some(&json!("hello-world"))
        );
        // Ids are derived from the parent, so a retry reproduces them.
        let again = convert(basic(), &options);
        assert_eq!(
            spans.iter().map(|s| s.span_id).collect::<Vec<_>>(),
            again.iter().map(|s| s.span_id).collect::<Vec<_>>()
        );
    }

    #[test]
    fn missing_timestamps_fall_back_to_the_previous_step() {
        let received_at = DateTime::from_timestamp_nanos(ns(T3));
        let spans = convert(
            json!({
                "steps": [
                    {"source": "user", "message": "go"},
                    {"source": "agent", "message": "ok"}
                ]
            }),
            &ConvertOptions {
                received_at,
                ..options()
            },
        );
        assert_eq!(start(&spans[0]), ns(T3));
        assert_eq!(start(&spans[1]), ns(T3));

        let spans = convert(
            json!({
                "steps": [
                    {"timestamp": "2025-01-01T00:00:10", "source": "user", "message": "go"},
                    {"source": "agent", "message": "ok"}
                ]
            }),
            &options(),
        );
        assert_eq!(end(&spans[1]), ns(T1));
    }

    #[test]
    fn dispatch_and_copied_steps_make_no_llm_span() {
        let spans = convert(
            json!({
                "steps": [
                    {"timestamp": T0, "source": "agent", "message": "copied", "is_copied_context": true},
                    {
                        "timestamp": T1, "source": "agent", "llm_call_count": 0,
                        "tool_calls": [{"tool_call_id": "c", "function_name": "dispatch"}]
                    }
                ]
            }),
            &options(),
        );
        assert!(named(&spans, "llm").is_empty());
        assert_eq!(named(&spans, "dispatch").len(), 1);
    }

    #[test]
    fn multimodal_content_keeps_url_images_and_references_files() {
        let spans = convert(
            json!({
                "steps": [
                    {"timestamp": T0, "source": "user", "message": [
                        {"type": "text", "text": "What is this?"},
                        {"type": "image", "source": {"media_type": "image/png", "path": "https://x.test/a.png"}},
                        {"type": "image", "source": {"media_type": "image/png", "path": "images/b.png"}}
                    ]},
                    {"timestamp": T1, "source": "user", "message": [
                        {"type": "text", "text": "line 1"},
                        {"type": "text", "text": "line 2"}
                    ]},
                    {"timestamp": T2, "source": "agent", "message": "A cat."}
                ]
            }),
            &options(),
        );
        let llm = named(&spans, "llm")[0];
        assert_eq!(
            llm.input,
            Some(json!([
                {"role": "user", "content": [
                    {"type": "text", "text": "What is this?"},
                    {"type": "image_url", "image_url": {"url": "https://x.test/a.png"}},
                    {"type": "text", "text": "[image: images/b.png]"}
                ]},
                {"role": "user", "content": "line 1\nline 2"}
            ]))
        );
    }

    #[test]
    fn histories_share_one_segment_until_materialized() {
        let converted = convert_trajectory(&trajectory(basic()), &options());
        assert_eq!(converted.history_segments.len(), 1);
        let refs: Vec<HistoryRef> = converted
            .spans
            .iter()
            .filter_map(|pending| pending.history)
            .collect();
        assert_eq!(
            refs,
            vec![
                HistoryRef { segment: 0, len: 2 },
                HistoryRef { segment: 0, len: 4 }
            ]
        );
        assert!(
            converted
                .spans
                .iter()
                .all(|pending| pending.span.input.is_none() || pending.history.is_none())
        );
    }

    #[test]
    fn lenient_schema_accepts_nulls_and_unknown_fields() {
        let spans = convert(
            json!({
                "agent": null,
                "steps": [
                    {"source": "narrator", "message": null, "tool_calls": null, "observation": null, "new_field": 1},
                    {"source": "agent", "message": {"weird": true}, "metrics": null}
                ],
                "subagent_trajectories": null
            }),
            &options(),
        );
        assert_eq!(spans[0].name, "agent");
        assert_eq!(
            named(&spans, "llm")[0].output,
            Some(json!([{"role": "assistant", "content": "{\"weird\":true}"}]))
        );
    }
}
