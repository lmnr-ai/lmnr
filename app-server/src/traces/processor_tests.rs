//! Pipeline test for `process_span_messages`: real producer-side dedup verdicts
//! feed the consumer, which runs against an in-memory cache / pubsub / queue
//! and a recording ClickHouse. Everything the consumer emits — table rows,
//! Redis stamps, realtime events, Quickwit payloads — is captured and checked.
//!
//! Set `PROCESSOR_SNAPSHOT_OUT=<path>` to also dump a normalized JSON snapshot
//! of every side effect, for diffing two builds of the processor.

use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use chrono::{DateTime, TimeZone, Utc};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::{
        Cache, CacheTrait,
        autocomplete::get_autocomplete_key,
        in_memory::InMemoryCache,
        keys::{DEDUP_STORAGE_SEEN_CACHE_KEY, DEDUP_TRACE_NEW_CACHE_KEY, PROJECT_CACHE_KEY},
    },
    ch::{ClickhouseInsertable, ClickhouseTrait},
    db::{
        DB,
        events::{Event, EventSource},
        projects::{PiiMode, ProjectSettings, ProjectWithWorkspaceBillingInfo, WorkspaceTierName},
        spans::{Span, SpanType},
        workspaces::WorkspaceDeployment,
    },
    mq::{
        MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiver, MessageQueueReceiverTrait,
        MessageQueueTrait, tokio_mpsc::TokioMpscQueue,
    },
    pubsub::{PubSub, PubSubTrait, in_memory::InMemoryPubSub},
    quickwit::{SPANS_INDEXER_EXCHANGE, SPANS_INDEXER_ROUTING_KEY},
    traces::{
        dedup::{
            content_hash,
            messages::{MessageDedup, build_message_dedup},
            session::resolve_session,
            span_group_id,
            tools::build_tool_dedup,
        },
        processor::process_span_messages,
        provider::convert_span_to_provider_format,
        span_attributes::{SPAN_METADATA_ONLY, SPAN_TRACE_INPUT, SPAN_TRACE_OUTPUT_HASHES},
        spans::SpanAttributes,
    },
};

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/// `(table, rows-as-JSON)` per `insert_batch` call, in call order.
type Inserts = Vec<(String, Vec<Value>)>;

/// Captures every `insert_batch`.
#[derive(Clone, Default)]
struct RecordingClickhouse {
    inserts: Arc<Mutex<Inserts>>,
}

impl RecordingClickhouse {
    fn take(&self) -> Inserts {
        std::mem::take(&mut *self.inserts.lock().unwrap())
    }
}

#[async_trait]
impl ClickhouseTrait for RecordingClickhouse {
    async fn insert_batch<T: ClickhouseInsertable>(
        &self,
        items: &[T],
        _config: Option<&WorkspaceDeployment>,
    ) -> anyhow::Result<()> {
        // `DataPlaneBatch` is the one `Serialize` view every insertable row
        // type shares; the wire tag names the table.
        let batch = serde_json::to_value(T::to_data_plane_batch(items.to_vec()))?;
        let table = batch["table"].as_str().unwrap().to_string();
        let rows = batch["data"].as_array().cloned().unwrap_or_default();
        self.inserts.lock().unwrap().push((table, rows));
        Ok(())
    }
}

struct Harness {
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    pubsub: Arc<PubSub>,
    ch: RecordingClickhouse,
    realtime: Arc<Mutex<Vec<(String, String)>>>,
    quickwit_rx: MessageQueueReceiver,
}

impl Harness {
    async fn new() -> Self {
        // Never connected: every DB read in this pipeline is served from the
        // seeded cache, and no aggregation carries `rollout.session_id`.
        let db = Arc::new(DB {
            pool: PgPool::connect_lazy("postgres://127.0.0.1:1/unused").unwrap(),
        });
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(Some(100_000))));
        let queue = Arc::new(MessageQueue::TokioMpsc(TokioMpscQueue::new()));
        let quickwit_rx = queue
            .get_receiver("qw", SPANS_INDEXER_EXCHANGE, SPANS_INDEXER_ROUTING_KEY, 1)
            .await
            .unwrap();
        let pubsub = Arc::new(PubSub::InMemory(InMemoryPubSub::new()));

        let realtime: Arc<Mutex<Vec<(String, String)>>> = Arc::default();
        {
            let pubsub = pubsub.clone();
            let realtime = realtime.clone();
            tokio::spawn(async move {
                pubsub
                    .subscribe("sse:*:*", move |channel, payload| {
                        realtime.lock().unwrap().push((channel, payload));
                    })
                    .await
                    .unwrap();
            });
        }
        // Let the subscriber register before anything publishes.
        tokio::time::sleep(Duration::from_millis(50)).await;

        Self {
            db,
            cache,
            queue,
            pubsub,
            ch: RecordingClickhouse::default(),
            realtime,
            quickwit_rx,
        }
    }

    async fn seed_project(&self, project_id: Uuid, mode: PiiMode) {
        let info = ProjectWithWorkspaceBillingInfo {
            id: project_id,
            name: "p".into(),
            workspace_id: id(0xA0),
            tier_name: WorkspaceTierName::Pro,
            reset_time: at(0),
            workspace_project_ids: vec![project_id],
            bytes_limit: i64::MAX,
            signal_cost_included_micro_usd: 0,
            custom_bytes_limit: None,
            signal_cost_hard_limit_micro_usd: None,
            settings: ProjectSettings {
                pii_mode: Some(mode),
                remove_pii: false,
                score_direction_overrides: Default::default(),
            },
        };
        self.cache
            .insert(&format!("{PROJECT_CACHE_KEY}:{project_id}"), info)
            .await
            .unwrap();
        // Warm autocomplete so the consumer never reaches for the CH client.
        self.cache
            .zadd(
                &get_autocomplete_key("spans", project_id, "names"),
                0.0,
                "warm",
            )
            .await
            .unwrap();
    }

    /// Producer side, as `producer::preprocess_for_queue` does it: enrich,
    /// convert, settle the session, build the three verdicts, strip the
    /// dedup'd fields off the wire.
    async fn produce(&self, mut span: Span) -> RabbitMqSpanMessage {
        span.parse_and_enrich_attributes();
        convert_span_to_provider_format(&mut span);
        resolve_session(&mut span, &self.cache).await;
        let tool_dedup = build_tool_dedup(&mut span, &self.cache).await;
        let input_dedup = build_message_dedup(&span, span.input.as_ref(), &self.cache).await;
        let output_dedup = build_message_dedup(&span, span.output.as_ref(), &self.cache).await;
        if input_dedup.is_some() {
            span.input = None;
        }
        if output_dedup.is_some() {
            span.output = None;
        }
        RabbitMqSpanMessage {
            span,
            pre_processed: true,
            input_dedup,
            output_dedup,
            tool_dedup,
        }
    }

    async fn flush(&mut self, messages: Vec<RabbitMqSpanMessage>) -> Flush {
        process_span_messages(
            messages,
            self.db.clone(),
            clickhouse::Client::default(),
            self.cache.clone(),
            self.queue.clone(),
            self.pubsub.clone(),
            self.ch.clone(),
            None,
            None,
            None,
            true,
        )
        .await
        .expect("flush succeeds");
        // Pubsub delivery hops through an unbounded channel to the subscriber.
        tokio::time::sleep(Duration::from_millis(50)).await;

        let mut quickwit = Vec::new();
        while let Ok(Some(Ok(delivery))) =
            tokio::time::timeout(Duration::from_millis(20), self.quickwit_rx.receive()).await
        {
            quickwit.push(serde_json::from_slice::<Value>(&delivery.data()).unwrap());
        }
        Flush {
            inserts: self.ch.take(),
            realtime: std::mem::take(&mut *self.realtime.lock().unwrap()),
            quickwit,
        }
    }

    async fn mark_exists(&self, key: &str) -> bool {
        self.cache.exists(key).await.unwrap()
    }
}

struct Flush {
    inserts: Inserts,
    realtime: Vec<(String, String)>,
    quickwit: Vec<Value>,
}

impl Flush {
    fn rows(&self, table: &str) -> Vec<Value> {
        self.inserts
            .iter()
            .filter(|(t, _)| t == table)
            .flat_map(|(_, rows)| rows.iter().cloned())
            .collect()
    }

    fn first_insert_of(&self, table: &str) -> Option<usize> {
        self.inserts.iter().position(|(t, _)| t == table)
    }

    fn span_row(&self, span_id: Uuid) -> Value {
        self.rows("spans")
            .into_iter()
            .find(|r| uuid_of(&r["span_id"]) == span_id)
            .unwrap_or_else(|| panic!("no spans row for {span_id}"))
    }

    fn realtime_events(&self, channel_suffix: &str, event_type: &str) -> Vec<Value> {
        self.realtime
            .iter()
            .filter(|(channel, _)| channel.ends_with(channel_suffix))
            .map(|(_, payload)| serde_json::from_str::<Value>(payload).unwrap())
            .filter(|m| m["event_type"] == event_type)
            .collect()
    }

    fn quickwit_docs(&self, kind: &str) -> Vec<Value> {
        self.quickwit
            .iter()
            .filter(|p| p["type"] == kind)
            .flat_map(|p| p["data"].as_array().cloned().unwrap_or_default())
            .collect()
    }
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

fn id(n: u128) -> Uuid {
    Uuid::from_u128(n)
}

fn at(secs: i64) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2024, 1, 1, 0, 0, 0).unwrap() + chrono::Duration::seconds(secs)
}

const P_OFF: u128 = 0x10;
const P_REDACT: u128 = 0x20;
const P_DUAL: u128 = 0x30;
const T1: u128 = 0x101;
const T2: u128 = 0x201;
const T3: u128 = 0x301;
const T9: u128 = 0x901;
const S1: u128 = 0x1001;
const S2: u128 = 0x1002;
const S3: u128 = 0x1003;
const S4: u128 = 0x2004;
const S5: u128 = 0x3005;
const S6: u128 = 0x3006;
const S7: u128 = 0x1007;
const S8: u128 = 0x1008;

struct SpanSpec {
    project: u128,
    trace: u128,
    id: u128,
    parent: Option<u128>,
    name: &'static str,
    span_type: SpanType,
    attrs: Value,
    input: Option<Value>,
    output: Option<Value>,
    start: i64,
    end: i64,
    events: Vec<(&'static str, Value)>,
}

fn build(spec: SpanSpec) -> Span {
    let attrs: HashMap<String, Value> = serde_json::from_value(spec.attrs).unwrap();
    let events = spec
        .events
        .into_iter()
        .enumerate()
        .map(|(i, (name, attributes))| Event {
            id: id(spec.id * 0x100 + i as u128),
            span_id: id(spec.id),
            project_id: id(spec.project),
            timestamp: at(spec.start),
            name: name.to_string(),
            attributes,
            trace_id: id(spec.trace),
            source: EventSource::Code,
        })
        .collect();
    Span {
        span_id: id(spec.id),
        project_id: id(spec.project),
        trace_id: id(spec.trace),
        parent_span_id: spec.parent.map(id),
        name: spec.name.to_string(),
        attributes: SpanAttributes::new(attrs),
        input: spec.input,
        output: spec.output,
        span_type: spec.span_type,
        start_time: at(spec.start),
        end_time: at(spec.end),
        events,
        status: None,
        tags: None,
        size_bytes: 0,
    }
}

fn llm_attrs(extra: Value) -> Value {
    let mut attrs = json!({
        "lmnr.span.type": "LLM",
        "gen_ai.system": "openai",
        "gen_ai.request.model": "gpt-4o",
        "gen_ai.response.model": "gpt-4o-2024-08-06",
        "gen_ai.usage.input_tokens": 100,
        "gen_ai.usage.output_tokens": 20,
        "gen_ai.usage.input_cost": 0.001,
        "gen_ai.usage.output_cost": 0.002,
        "lmnr.span.path": ["agent", "llm"],
    });
    attrs
        .as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());
    attrs
}

fn tools() -> Value {
    json!([{ "name": "search", "description": "web search", "parameters": { "type": "object" } }])
}

fn msg(role: &str, content: &str) -> Value {
    json!({ "role": role, "content": content })
}

fn history() -> Vec<Value> {
    vec![
        msg("system", "You are helpful."),
        msg("user", "Fix the tests."),
        msg("assistant", "Sure, looking."),
    ]
}

fn metadata_only(project: u128, trace: u128, id_: u128, attrs: Value) -> Span {
    let mut all = json!({ SPAN_METADATA_ONLY: true });
    all.as_object_mut()
        .unwrap()
        .extend(attrs.as_object().unwrap().clone());
    build(SpanSpec {
        project,
        trace,
        id: id_,
        parent: None,
        name: "lmnr.internal.metadata",
        span_type: SpanType::Default,
        attrs: all,
        input: None,
        output: None,
        start: 0,
        end: 0,
        events: vec![],
    })
}

/// First flush: everything but S3.
fn flush_one_spans() -> Vec<Span> {
    vec![
        // T1 root: non-LLM, small, two events (one exception).
        build(SpanSpec {
            project: P_OFF,
            trace: T1,
            id: S1,
            parent: None,
            name: "agent",
            span_type: SpanType::Default,
            attrs: json!({
                "lmnr.span.type": "DEFAULT",
                "lmnr.span.path": ["agent"],
                "lmnr.association.properties.user_id": "u-1",
                "lmnr.association.properties.metadata.team": "core",
                "lmnr.association.properties.tags": ["b", "a"],
            }),
            input: Some(json!({ "task": "fix the tests" })),
            output: Some(json!("done")),
            start: 10,
            end: 40,
            events: vec![
                ("checkpoint", json!({ "step": 1 })),
                ("exception", json!({ "exception.message": "boom" })),
            ],
        }),
        // T1 LLM child: input/output/tool dedup, all storage-miss + trace-new.
        build(SpanSpec {
            project: P_OFF,
            trace: T1,
            id: S2,
            parent: Some(S1),
            name: "openai.chat",
            span_type: SpanType::LLM,
            attrs: llm_attrs(json!({ "ai.prompt.tools": tools() })),
            input: Some(Value::Array(history())),
            output: Some(json!([msg("assistant", "Found it.")])),
            start: 12,
            end: 20,
            events: vec![],
        }),
        // T1 non-recordable non-LLM (browser-session signal span).
        build(SpanSpec {
            project: P_OFF,
            trace: T1,
            id: S7,
            parent: Some(S1),
            name: "cdp_use.session",
            span_type: SpanType::Default,
            attrs: json!({ "lmnr.internal.has_browser_session": true }),
            input: Some(json!({ "url": "https://example.com" })),
            output: None,
            start: 13,
            end: 14,
            events: vec![],
        }),
        // T1 non-recordable LLM (CC Bash proxy call): billed from the wire
        // verdict, counted in trace totals, never a `spans` row.
        build(SpanSpec {
            project: P_OFF,
            trace: T1,
            id: S8,
            parent: Some(S1),
            name: "anthropic.messages",
            span_type: SpanType::LLM,
            attrs: llm_attrs(json!({
                "lmnr.internal.claude_code_proxy": true,
                "lmnr.internal.cc_skip_span": true,
                "gen_ai.usage.input_tokens": 10,
                "gen_ai.usage.output_tokens": 5,
            })),
            input: Some(json!([msg("user", "ls"), msg("assistant", "ok")])),
            output: None,
            start: 15,
            end: 16,
            events: vec![],
        }),
        // T2 (redact project, session-scoped group): LLM root with an
        // exception event.
        build(SpanSpec {
            project: P_REDACT,
            trace: T2,
            id: S4,
            parent: None,
            name: "openai.chat",
            span_type: SpanType::LLM,
            attrs: llm_attrs(json!({
                "lmnr.association.properties.session_id": "sess-2",
            })),
            input: Some(json!([msg("user", "my card is 4111 1111 1111 1111")])),
            output: Some(json!([msg("assistant", "noted")])),
            start: 100,
            end: 105,
            events: vec![("exception", json!({ "exception.type": "RateLimit" }))],
        }),
        // T3 (dual project): non-LLM root shipped WITHOUT producer preprocessing.
        build(SpanSpec {
            project: P_DUAL,
            trace: T3,
            id: S5,
            parent: None,
            name: "handler",
            span_type: SpanType::Default,
            attrs: json!({ "lmnr.span.type": "DEFAULT" }),
            input: Some(json!("call me at 555-0100")),
            output: Some(json!({ "ok": true })),
            start: 200,
            end: 210,
            events: vec![],
        }),
        // T3 LLM child.
        build(SpanSpec {
            project: P_DUAL,
            trace: T3,
            id: S6,
            parent: Some(S5),
            name: "openai.chat",
            span_type: SpanType::LLM,
            attrs: llm_attrs(json!({})),
            input: Some(json!([msg("user", "hello")])),
            output: Some(json!([msg("assistant", "hi")])),
            start: 201,
            end: 205,
            events: vec![],
        }),
    ]
}

fn hex_hash(v: &Value) -> String {
    hex::encode(content_hash(v))
}

/// Second flush: S3 continues T1's conversation — three seen messages plus
/// one new, same tools.
fn flush_two_span() -> Span {
    let mut input = history();
    input.push(msg("user", "Now run them."));
    build(SpanSpec {
        project: P_OFF,
        trace: T1,
        id: S3,
        parent: Some(S1),
        name: "openai.chat",
        span_type: SpanType::LLM,
        attrs: llm_attrs(json!({ "ai.prompt.tools": tools() })),
        input: Some(Value::Array(input)),
        output: Some(json!([msg("assistant", "All green.")])),
        start: 22,
        end: 30,
        events: vec![],
    })
}

// ---------------------------------------------------------------------------
// Helpers over recorded output
// ---------------------------------------------------------------------------

/// `clickhouse::serde::uuid` writes a string for human-readable formats and
/// the 16 raw bytes otherwise; accept both.
fn uuid_of(v: &Value) -> Uuid {
    match v {
        Value::String(s) => Uuid::parse_str(s).unwrap(),
        Value::Array(bytes) => {
            let bytes: Vec<u8> = bytes.iter().map(|b| b.as_u64().unwrap() as u8).collect();
            Uuid::from_slice(&bytes).unwrap()
        }
        other => panic!("not a uuid: {other}"),
    }
}

fn storage_key(span: &Span, hash: &[u8; 32]) -> String {
    format!(
        "{DEDUP_STORAGE_SEEN_CACHE_KEY}:{}:{}:{}",
        span.project_id,
        span_group_id(span),
        hex::encode(hash)
    )
}

fn trace_new_key(span: &Span, hash: &[u8; 32]) -> String {
    format!(
        "{DEDUP_TRACE_NEW_CACHE_KEY}:{}:{}:{}",
        span.project_id,
        span.trace_id,
        hex::encode(hash)
    )
}

fn hashes_of(v: &Value) -> Vec<[u8; 32]> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|h| {
            let bytes: Vec<u8> = h
                .as_array()
                .unwrap()
                .iter()
                .map(|b| b.as_u64().unwrap() as u8)
                .collect();
            bytes.try_into().unwrap()
        })
        .collect()
}

fn u16s(v: &Value) -> Vec<u16> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|x| x.as_u64().unwrap() as u16)
        .collect()
}

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

#[tokio::test]
async fn pipeline_end_to_end() {
    let mut h = Harness::new().await;
    h.seed_project(id(P_OFF), PiiMode::Off).await;
    h.seed_project(id(P_REDACT), PiiMode::Redact).await;
    h.seed_project(id(P_DUAL), PiiMode::Dual).await;

    // ---- flush 1 --------------------------------------------------------
    let mut messages = Vec::new();
    for span in flush_one_spans() {
        if span.span_id == id(S5) {
            messages.push(RabbitMqSpanMessage {
                span,
                pre_processed: false,
                input_dedup: None,
                output_dedup: None,
                tool_dedup: None,
            });
        } else {
            messages.push(h.produce(span).await);
        }
    }
    let verdict = |sid: u128| -> RabbitMqSpanMessage {
        messages
            .iter()
            .find(|m| m.span.span_id == id(sid))
            .unwrap()
            .clone()
    };
    let (m2, m4, m6, m8) = (verdict(S2), verdict(S4), verdict(S6), verdict(S8));
    assert!(m2.input_dedup.is_some() && m2.output_dedup.is_some() && m2.tool_dedup.is_some());
    assert!(
        m8.input_dedup.is_some(),
        "the producer dedups every LLM span"
    );

    // Metadata-only virtual spans: a customer patch on T1, a patch on a trace
    // this flush knows nothing about, extracted agent io for T1 (with one bad
    // hash and a debugger session) and for the dual project.
    let out_hash = hex_hash(&msg("assistant", "done"));
    for span in [
        metadata_only(
            P_OFF,
            T1,
            0xA1,
            json!({ "lmnr.association.properties.metadata.env": "prod" }),
        ),
        metadata_only(
            P_OFF,
            T9,
            0xA9,
            json!({ "lmnr.association.properties.metadata.env": "stage" }),
        ),
        metadata_only(
            P_OFF,
            T1,
            0xB1,
            json!({
                SPAN_TRACE_INPUT: "fix the tests",
                SPAN_TRACE_OUTPUT_HASHES: [out_hash, "not-hex"],
                "lmnr.association.properties.metadata.rollout.session_id": "rs-1",
            }),
        ),
        metadata_only(
            P_DUAL,
            T3,
            0xB3,
            json!({ SPAN_TRACE_INPUT: "call me back" }),
        ),
    ] {
        messages.push(h.produce(span).await);
    }

    let f1 = h.flush(messages).await;
    write_snapshot("flush1", &h, &f1, &[&m2, &m4, &m6, &m8]).await;

    // Ingest order: content before spans, both trace tables written.
    let tables: Vec<&str> = f1.inserts.iter().map(|(t, _)| t.as_str()).collect();
    assert!(
        f1.first_insert_of("unique_content") < f1.first_insert_of("spans"),
        "unique_content must land before spans: {tables:?}"
    );
    for t in ["unique_content", "spans", "traces_agg", "traces_static"] {
        assert!(tables.contains(&t), "missing {t} in {tables:?}");
    }

    // Only recordable spans become rows.
    let mut span_ids: Vec<Uuid> = f1
        .rows("spans")
        .iter()
        .map(|r| uuid_of(&r["span_id"]))
        .collect();
    span_ids.sort();
    let mut expected = vec![id(S1), id(S2), id(S4), id(S5), id(S6)];
    expected.sort();
    assert_eq!(span_ids, expected);

    // S2: dedup'd fields ship hashes, every position trace-new, tools hashed,
    // usage from the cost attributes, nothing PII-checked without a redactor.
    let s2 = f1.span_row(id(S2));
    assert_eq!(s2["input"], "");
    assert_eq!(s2["output"], "");
    assert_eq!(hashes_of(&s2["input_message_hashes"]).len(), 3);
    assert_eq!(u16s(&s2["input_new_message_indices"]), vec![0, 1, 2]);
    assert_eq!(hashes_of(&s2["output_message_hashes"]).len(), 1);
    assert_eq!(u16s(&s2["output_new_message_indices"]), vec![0]);
    assert_ne!(
        hashes_of(&json!([s2["tool_definitions_hash"]]))[0],
        [0u8; 32]
    );
    assert_eq!(s2["input_tokens"], 100);
    assert_eq!(s2["output_tokens"], 20);
    assert!((s2["total_cost"].as_f64().unwrap() - 0.003).abs() < 1e-9);
    assert_eq!(s2["pii_checked"], false);
    assert_eq!(s2["model"], "gpt-4o-2024-08-06");
    assert_eq!(s2["path"], "agent.llm.openai.chat");
    assert!(s2["size_bytes"].as_u64().unwrap() > 0);

    // S1: raw input/output, user id, metadata, tags, events.
    let s1 = f1.span_row(id(S1));
    assert_eq!(s1["input"], json!({ "task": "fix the tests" }).to_string());
    assert_eq!(s1["output"], "\"done\"");
    assert_eq!(s1["user_id"], "u-1");
    assert_eq!(
        serde_json::from_str::<Value>(s1["trace_metadata"].as_str().unwrap()).unwrap(),
        json!({ "team": "core" })
    );
    let mut tags: Vec<&str> = s1["tags_array"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t.as_str().unwrap())
        .collect();
    tags.sort();
    assert_eq!(tags, vec!["a", "b"]);
    assert_eq!(s1["events"].as_array().unwrap().len(), 2);

    // S5 came in un-preprocessed: the consumer enriched it itself.
    let s5 = f1.span_row(id(S5));
    assert_eq!(s5["input"], "\"call me at 555-0100\"");
    assert_eq!(s5["span_type"], 0);

    // S4 / S6: hashes present; redaction never ran so rows stay unchecked.
    for sid in [S4, S6] {
        let row = f1.span_row(id(sid));
        assert_eq!(hashes_of(&row["input_message_hashes"]).len(), 1);
        assert_eq!(row["pii_checked"], false);
    }
    assert_eq!(f1.span_row(id(S4))["session_id"], "sess-2");

    // unique_content: every recordable storage-miss hash, S8's (non-recordable)
    // none, one row per (project, group, hash).
    let content_rows = f1.rows("unique_content");
    let stored: Vec<(Uuid, String, [u8; 32])> = content_rows
        .iter()
        .map(|r| {
            (
                uuid_of(&r["project_id"]),
                r["group_id"].as_str().unwrap().to_string(),
                hashes_of(&json!([r["content_hash"]]))[0],
            )
        })
        .collect();
    let mut unique = stored.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(unique.len(), stored.len(), "duplicate unique_content rows");
    for m in [&m2, &m4, &m6] {
        for d in [m.input_dedup.as_ref(), m.output_dedup.as_ref()]
            .into_iter()
            .flatten()
        {
            for &pos in &d.storage_miss_indices {
                let key = (
                    m.span.project_id,
                    span_group_id(&m.span),
                    d.hashes[pos as usize],
                );
                assert!(stored.contains(&key), "missing content row for {key:?}");
            }
        }
    }
    let td = m2.tool_dedup.as_ref().unwrap();
    assert!(stored.contains(&(m2.span.project_id, span_group_id(&m2.span), td.hash)));
    for h_ in &m8.input_dedup.as_ref().unwrap().hashes {
        assert!(
            !stored.iter().any(|(_, _, hh)| hh == h_),
            "non-recordable span content must not be stored"
        );
    }
    assert!(content_rows.iter().all(|r| r["pii_checked"] == false));
    // S4's group is its session, S2's its trace.
    assert_eq!(span_group_id(&m4.span), "sess-2");
    assert_eq!(span_group_id(&m2.span), id(T1).to_string());

    // traces_agg: one partial per trace in the batch plus one identity partial
    // per metadata patch. T1 totals include the non-recordable LLM span.
    let agg = f1.rows("traces_agg");
    let t1_partials: Vec<&Value> = agg.iter().filter(|r| uuid_of(&r["id"]) == id(T1)).collect();
    assert_eq!(t1_partials.len(), 2, "span partial + patch partial");
    let has_spans = |r: &&&Value| !r["span_names"].as_array().unwrap().is_empty();
    let t1 = t1_partials.iter().find(has_spans).unwrap();
    assert_eq!(
        t1["num_spans"], 4,
        "S1, S2, S7, S8 — metadata-only spans excluded"
    );
    assert_eq!(t1["input_tokens"], 110);
    assert_eq!(t1["output_tokens"], 25);
    assert_eq!(t1["start_time"], nanos(10));
    assert_eq!(t1["end_time"], nanos(40));
    assert_eq!(t1["metadata"], json!([["team", "\"core\""]]));
    let t1_patch = t1_partials.iter().find(|r| !has_spans(r)).unwrap();
    assert_eq!(t1_patch["metadata"], json!([["env", "\"prod\""]]));
    assert_eq!(
        t1_patch["start_time"],
        nanos(10),
        "patch partial shares the batch's start_time partition"
    );
    let t9 = agg.iter().find(|r| uuid_of(&r["id"]) == id(T9)).unwrap();
    assert!(
        t9["start_time"].as_i64().unwrap()
            > nanos(0).as_i64().unwrap() + 365 * 86_400 * 1_000_000_000,
        "unknown trace falls back to now + offset"
    );

    // traces_static: agent io lands in its own columns with the batch start.
    let stat = f1.rows("traces_static");
    let t1_io = stat
        .iter()
        .find(|r| uuid_of(&r["trace_id"]) == id(T1) && r["input"].is_string())
        .expect("T1 agent io row");
    assert_eq!(t1_io["input"], "fix the tests");
    assert_eq!(t1_io["output_hashes"], hex_hash(&msg("assistant", "done")));
    assert_eq!(t1_io["start_time"], nanos(10));
    let t1_patch_static = stat
        .iter()
        .find(|r| {
            uuid_of(&r["trace_id"]) == id(T1)
                && r["metadata"].is_string()
                && r["root_span_id"].is_null()
        })
        .expect("T1 patch row");
    assert_eq!(
        serde_json::from_str::<Value>(t1_patch_static["metadata"].as_str().unwrap()).unwrap(),
        json!({ "env": "prod" })
    );
    assert!(
        stat.iter()
            .any(|r| uuid_of(&r["trace_id"]) == id(T3) && r["input"] == "call me back"),
        "dual project io is still stored"
    );
    let t1_span_static = stat
        .iter()
        .find(|r| uuid_of(&r["trace_id"]) == id(T1) && !r["root_span_id"].is_null())
        .expect("T1 span-batch static row");
    assert_eq!(t1_span_static["root_span_name"], "agent");
    assert_eq!(t1_span_static["has_browser_session"], 1);

    // Redis stamps. With no redactor configured every stored row keeps its
    // storage mark (re-inserting would heal nothing — `PiiOutcome::
    // without_redactor`); `dual` spans are unindexable so their messages stay
    // trace-new for a later span; non-recordable S8 is stamped nowhere.
    let d2 = m2.input_dedup.as_ref().unwrap();
    for h_ in &d2.hashes {
        assert!(h.mark_exists(&storage_key(&m2.span, h_)).await);
        assert!(h.mark_exists(&trace_new_key(&m2.span, h_)).await);
    }
    assert!(h.mark_exists(&storage_key(&m2.span, &td.hash)).await);
    let d4 = m4.input_dedup.as_ref().unwrap();
    assert!(h.mark_exists(&storage_key(&m4.span, &d4.hashes[0])).await);
    assert!(h.mark_exists(&trace_new_key(&m4.span, &d4.hashes[0])).await);
    let d6 = m6.input_dedup.as_ref().unwrap();
    assert!(h.mark_exists(&storage_key(&m6.span, &d6.hashes[0])).await);
    assert!(!h.mark_exists(&trace_new_key(&m6.span, &d6.hashes[0])).await);
    let d8 = m8.input_dedup.as_ref().unwrap();
    assert!(!h.mark_exists(&storage_key(&m8.span, &d8.hashes[0])).await);
    assert!(!h.mark_exists(&trace_new_key(&m8.span, &d8.hashes[0])).await);

    // Realtime: trace deltas per project, span deltas per trace (recordable
    // only), agent_input to the project and debugger channels — never for
    // the dual project.
    let p_off_traces = f1.realtime_events(&format!("sse:{}:traces", id(P_OFF)), "trace_update");
    assert_eq!(p_off_traces.len(), 1);
    let ids: Vec<&str> = p_off_traces[0]["data"]["traces"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["id"].as_str().unwrap())
        .collect();
    assert_eq!(ids, vec![id(T1).to_string()]);
    let t1_spans = f1.realtime_events(&format!("trace_{}", id(T1)), "span_update");
    assert_eq!(t1_spans.len(), 1);
    let mut names: Vec<&str> = t1_spans[0]["data"]["spans"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["name"].as_str().unwrap())
        .collect();
    names.sort();
    assert_eq!(names, vec!["agent", "openai.chat"]);
    let agent_inputs = f1.realtime_events("", "trace_agent_input_update");
    let mut agent_channels: Vec<String> = f1
        .realtime
        .iter()
        .filter(|(_, p)| p.contains("trace_agent_input_update"))
        .map(|(c, _)| c.clone())
        .collect();
    agent_channels.sort();
    assert_eq!(
        agent_channels,
        vec![
            format!("sse:{}:rollout_session_rs-1", id(P_OFF)),
            format!("sse:{}:traces", id(P_OFF)),
        ],
        "one per channel for T1, none for the dual project"
    );
    assert!(
        agent_inputs
            .iter()
            .all(|e| e["data"]["agentInput"] == "fix the tests")
    );

    // Quickwit: one Spans + one Events payload. LLM docs carry only trace-new
    // messages; dual-project docs fail closed; the redact project (no
    // redactor) is still indexable.
    assert_eq!(f1.quickwit.len(), 2, "{:?}", f1.quickwit);
    let docs = f1.quickwit_docs("spans");
    let doc = |sid: u128| {
        docs.iter()
            .find(|d| d["span_id"] == id(sid).to_string())
            .unwrap_or_else(|| panic!("no quickwit doc for {sid:#x}"))
    };
    assert_eq!(docs.len(), 5);
    assert!(doc(S1)["input"].as_str().unwrap().contains("fix the tests"));
    let s2_input = doc(S2)["input"].as_str().unwrap();
    assert!(s2_input.contains("You are helpful") && s2_input.contains("Sure, looking"));
    assert!(doc(S2)["output"].as_str().unwrap().contains("Found it"));
    assert!(doc(S4)["input"].as_str().unwrap().contains("4111"));
    assert!(doc(S5)["input"].is_null() && doc(S5)["output"].is_null());
    assert!(doc(S6)["input"].is_null() && doc(S6)["output"].is_null());
    let events = f1.quickwit_docs("events");
    assert_eq!(events.len(), 3);
    assert_eq!(
        events.iter().filter(|e| e["is_exception"] == true).count(),
        2
    );

    // ---- flush 2 --------------------------------------------------------
    let m3 = h.produce(flush_two_span()).await;
    let d3 = m3.input_dedup.as_ref().unwrap();
    assert_eq!(d3.hashes.len(), 4);
    assert_eq!(
        d3.trace_new_indices,
        vec![3],
        "producer saw flush 1's stamps"
    );
    assert_eq!(d3.storage_miss_indices, vec![3]);
    assert!(
        m3.tool_dedup.as_ref().unwrap().content.is_none(),
        "tools already stored"
    );
    let m3_patch = h
        .produce(metadata_only(
            P_OFF,
            T1,
            0xA2,
            json!({ "lmnr.association.properties.metadata.env": "prod2" }),
        ))
        .await;

    let f2 = h.flush(vec![m3.clone(), m3_patch]).await;
    write_snapshot("flush2", &h, &f2, &[&m3]).await;

    let s3 = f2.span_row(id(S3));
    assert_eq!(hashes_of(&s3["input_message_hashes"]).len(), 4);
    assert_eq!(u16s(&s3["input_new_message_indices"]), vec![3]);
    assert_eq!(u16s(&s3["output_new_message_indices"]), vec![0]);
    assert_eq!(s3["tool_definitions_hash"], s2["tool_definitions_hash"]);
    // Only the new input message and the new output message hit storage.
    let content2 = f2.rows("unique_content");
    assert_eq!(content2.len(), 2, "{content2:?}");
    assert!(
        content2
            .iter()
            .any(|r| r["content"].as_str().unwrap().contains("Now run them"))
    );
    assert!(
        content2
            .iter()
            .any(|r| r["content"].as_str().unwrap().contains("All green"))
    );
    // Dedup billing: the seen prefix costs 32B/hash, the new message its bytes.
    let s3_size = s3["size_bytes"].as_u64().unwrap();
    let s2_size = s2["size_bytes"].as_u64().unwrap();
    assert!(
        s3_size > 0 && s3_size < s2_size + 2 * 1024,
        "{s3_size} vs {s2_size}"
    );
    assert!(h.mark_exists(&trace_new_key(&m3.span, &d3.hashes[3])).await);
    assert!(h.mark_exists(&storage_key(&m3.span, &d3.hashes[3])).await);

    let agg2 = f2.rows("traces_agg");
    assert_eq!(
        agg2.iter().filter(|r| uuid_of(&r["id"]) == id(T1)).count(),
        2
    );
    let t1_spans2 = f2.realtime_events(&format!("trace_{}", id(T1)), "span_update");
    assert_eq!(t1_spans2[0]["data"]["spans"].as_array().unwrap().len(), 1);
    let doc3 = f2
        .quickwit_docs("spans")
        .into_iter()
        .find(|d| d["span_id"] == id(S3).to_string())
        .unwrap();
    let s3_input = doc3["input"].as_str().unwrap();
    assert!(s3_input.contains("Now run them") && !s3_input.contains("You are helpful"));
}

fn nanos(secs: i64) -> Value {
    json!(at(secs).timestamp_nanos_opt().unwrap())
}

// ---------------------------------------------------------------------------
// Snapshot (opt-in): every side effect, normalized for a cross-build diff
// ---------------------------------------------------------------------------

async fn write_snapshot(name: &str, h: &Harness, flush: &Flush, verdicts: &[&RabbitMqSpanMessage]) {
    let Ok(dir) = std::env::var("PROCESSOR_SNAPSHOT_OUT") else {
        return;
    };

    let mut tables: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for (table, rows) in &flush.inserts {
        tables
            .entry(table.clone())
            .or_default()
            .extend(rows.iter().map(|r| normalize(r.clone())));
    }
    for rows in tables.values_mut() {
        rows.sort_by_key(|r| r.to_string());
    }

    let mut marks: BTreeMap<String, bool> = BTreeMap::new();
    for m in verdicts {
        let dedups: Vec<&MessageDedup> = [m.input_dedup.as_ref(), m.output_dedup.as_ref()]
            .into_iter()
            .flatten()
            .collect();
        for d in dedups {
            for hash in &d.hashes {
                for key in [storage_key(&m.span, hash), trace_new_key(&m.span, hash)] {
                    marks.insert(key.clone(), h.mark_exists(&key).await);
                }
            }
        }
        if let Some(td) = &m.tool_dedup {
            let key = storage_key(&m.span, &td.hash);
            marks.insert(key.clone(), h.mark_exists(&key).await);
        }
    }

    let mut realtime: Vec<Value> = flush
        .realtime
        .iter()
        .map(|(channel, payload)| {
            let mut message: Value = serde_json::from_str(payload).unwrap();
            if let Some(traces) = message
                .get_mut("data")
                .and_then(|d| d.get_mut("traces"))
                .and_then(Value::as_array_mut)
            {
                traces.sort_by_key(|t| t["id"].to_string());
            }
            normalize(json!({ "channel": channel, "message": message }))
        })
        .collect();
    realtime.sort_by_key(|r| r.to_string());

    let quickwit: Vec<Value> = flush
        .quickwit
        .iter()
        .map(|payload| {
            let mut payload = payload.clone();
            if let Some(docs) = payload["data"].as_array_mut() {
                for doc in docs.iter_mut() {
                    // Cleaned attribute text follows HashMap order. It is
                    // normally still JSON (canonicalized by `normalize`); if
                    // cleaning broke that, fall back to a character multiset.
                    if let Some(attrs) = doc["attributes"].as_str()
                        && serde_json::from_str::<Value>(attrs).is_err()
                    {
                        let mut chars: Vec<char> = attrs.chars().collect();
                        chars.sort_unstable();
                        doc["attributes"] = Value::String(chars.into_iter().collect());
                    }
                }
                docs.sort_by_key(|d| d["span_id"].to_string() + &d["id"].to_string());
            }
            normalize(payload)
        })
        .collect();

    let snapshot = json!({
        "tables": tables,
        "marks": marks,
        "realtime": realtime,
        "quickwit": quickwit,
    });
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        format!("{dir}/{name}.json"),
        serde_json::to_string_pretty(&snapshot).unwrap(),
    )
    .unwrap();
}

/// Any nanosecond timestamp after the fixture's year is a `Utc::now()` fallback.
const NOW_THRESHOLD_NS: i64 = 1_735_689_600_000_000_000; // 2025-01-01

/// Order-insensitive view: object keys sorted, JSON-in-string re-serialized
/// canonically, string arrays sorted (HashSet-derived columns), wall-clock
/// fallbacks collapsed.
fn normalize(v: Value) -> Value {
    match v {
        Value::Object(map) => {
            let sorted: BTreeMap<String, Value> =
                map.into_iter().map(|(k, v)| (k, normalize(v))).collect();
            Value::Object(sorted.into_iter().collect())
        }
        Value::Array(items) => {
            let mut items: Vec<Value> = items.into_iter().map(normalize).collect();
            let all_strings = items.iter().all(Value::is_string);
            let all_string_pairs = items
                .iter()
                .all(|i| i.as_array().is_some_and(|a| a.iter().all(Value::is_string)));
            if !items.is_empty() && (all_strings || all_string_pairs) {
                items.sort_by_key(|i| i.to_string());
            }
            Value::Array(items)
        }
        Value::String(s) => match serde_json::from_str::<Value>(&s) {
            Ok(inner @ (Value::Object(_) | Value::Array(_))) => {
                Value::String(normalize(inner).to_string())
            }
            _ => Value::String(s),
        },
        Value::Number(n) => match n.as_i64() {
            Some(i) if i > NOW_THRESHOLD_NS => Value::String("NOW".into()),
            _ => Value::Number(n),
        },
        other => other,
    }
}
