//! Serde shadow types for the OTLP/HTTP+JSON encoding of `ExportTraceServiceRequest`.
//!
//! `prost`-generated types only know protobuf wire format. Browser SDKs send the
//! OTel-spec OTLP/JSON encoding (base64 ID bytes, decimal-stringified `fixed64`,
//! enum-name strings). This module owns that mapping: deserialise into shadow
//! structs, then `Into` the prost types the rest of the pipeline already speaks.
//!
//! Shape per spec: <https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding>.

use base64::Engine;
use serde::Deserialize;

use crate::opentelemetry_proto::opentelemetry::proto::collector::trace::v1::ExportTraceServiceRequest;
use crate::opentelemetry_proto::opentelemetry_proto_common_v1 as common;
use crate::opentelemetry_proto::opentelemetry_proto_resource_v1 as resource;
use crate::opentelemetry_proto::opentelemetry_proto_trace_v1 as trace;

#[derive(thiserror::Error, Debug)]
pub enum JsonDecodeError {
    #[error("invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid {field}: {message}")]
    Field {
        field: &'static str,
        message: String,
    },
}

pub fn decode_export_trace_service_request(
    body: &[u8],
) -> Result<ExportTraceServiceRequest, JsonDecodeError> {
    let raw: ExportTraceServiceRequestJson = serde_json::from_slice(body)?;
    raw.try_into()
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ExportTraceServiceRequestJson {
    resource_spans: Vec<ResourceSpansJson>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ResourceSpansJson {
    resource: Option<ResourceJson>,
    scope_spans: Vec<ScopeSpansJson>,
    schema_url: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ResourceJson {
    attributes: Vec<KeyValueJson>,
    dropped_attributes_count: u32,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ScopeSpansJson {
    scope: Option<InstrumentationScopeJson>,
    spans: Vec<SpanJson>,
    schema_url: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct InstrumentationScopeJson {
    name: String,
    version: String,
    attributes: Vec<KeyValueJson>,
    dropped_attributes_count: u32,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct SpanJson {
    trace_id: String,
    span_id: String,
    trace_state: String,
    parent_span_id: String,
    flags: u32,
    name: String,
    #[serde(deserialize_with = "deserialize_span_kind")]
    kind: i32,
    #[serde(deserialize_with = "deserialize_u64_or_string")]
    start_time_unix_nano: u64,
    #[serde(deserialize_with = "deserialize_u64_or_string")]
    end_time_unix_nano: u64,
    attributes: Vec<KeyValueJson>,
    dropped_attributes_count: u32,
    events: Vec<EventJson>,
    dropped_events_count: u32,
    links: Vec<LinkJson>,
    dropped_links_count: u32,
    status: Option<StatusJson>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct EventJson {
    #[serde(deserialize_with = "deserialize_u64_or_string")]
    time_unix_nano: u64,
    name: String,
    attributes: Vec<KeyValueJson>,
    dropped_attributes_count: u32,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct LinkJson {
    trace_id: String,
    span_id: String,
    trace_state: String,
    attributes: Vec<KeyValueJson>,
    dropped_attributes_count: u32,
    flags: u32,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct StatusJson {
    #[serde(default)]
    message: String,
    #[serde(default, deserialize_with = "deserialize_status_code")]
    code: i32,
}

#[derive(Deserialize)]
struct KeyValueJson {
    key: String,
    #[serde(default)]
    value: Option<AnyValueJson>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum AnyValueJson {
    #[serde(rename = "stringValue")]
    String(String),
    #[serde(rename = "boolValue")]
    Bool(bool),
    #[serde(
        rename = "intValue",
        deserialize_with = "deserialize_i64_or_string_field"
    )]
    Int(i64),
    #[serde(rename = "doubleValue")]
    Double(f64),
    #[serde(rename = "arrayValue")]
    Array(ArrayValueJson),
    #[serde(rename = "kvlistValue")]
    KvList(KeyValueListJson),
    #[serde(rename = "bytesValue")]
    Bytes(String),
}

#[derive(Deserialize, Default)]
struct ArrayValueJson {
    #[serde(default)]
    values: Vec<AnyValueJson>,
}

#[derive(Deserialize, Default)]
struct KeyValueListJson {
    #[serde(default)]
    values: Vec<KeyValueJson>,
}

// --- conversions ---------------------------------------------------------

impl TryFrom<ExportTraceServiceRequestJson> for ExportTraceServiceRequest {
    type Error = JsonDecodeError;

    fn try_from(v: ExportTraceServiceRequestJson) -> Result<Self, Self::Error> {
        Ok(Self {
            resource_spans: v
                .resource_spans
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
        })
    }
}

impl TryFrom<ResourceSpansJson> for trace::ResourceSpans {
    type Error = JsonDecodeError;

    fn try_from(v: ResourceSpansJson) -> Result<Self, Self::Error> {
        Ok(Self {
            resource: v.resource.map(Into::into),
            scope_spans: v
                .scope_spans
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            schema_url: v.schema_url,
        })
    }
}

impl From<ResourceJson> for resource::Resource {
    fn from(v: ResourceJson) -> Self {
        Self {
            attributes: v.attributes.into_iter().map(Into::into).collect(),
            dropped_attributes_count: v.dropped_attributes_count,
        }
    }
}

impl TryFrom<ScopeSpansJson> for trace::ScopeSpans {
    type Error = JsonDecodeError;

    fn try_from(v: ScopeSpansJson) -> Result<Self, Self::Error> {
        Ok(Self {
            scope: v.scope.map(Into::into),
            spans: v
                .spans
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            schema_url: v.schema_url,
        })
    }
}

impl From<InstrumentationScopeJson> for common::InstrumentationScope {
    fn from(v: InstrumentationScopeJson) -> Self {
        Self {
            name: v.name,
            version: v.version,
            attributes: v.attributes.into_iter().map(Into::into).collect(),
            dropped_attributes_count: v.dropped_attributes_count,
        }
    }
}

impl TryFrom<SpanJson> for trace::Span {
    type Error = JsonDecodeError;

    fn try_from(v: SpanJson) -> Result<Self, Self::Error> {
        Ok(Self {
            trace_id: decode_id_field("trace_id", &v.trace_id, 16, false)?,
            span_id: decode_id_field("span_id", &v.span_id, 8, false)?,
            trace_state: v.trace_state,
            parent_span_id: decode_id_field("parent_span_id", &v.parent_span_id, 8, true)?,
            flags: v.flags,
            name: v.name,
            kind: v.kind,
            start_time_unix_nano: v.start_time_unix_nano,
            end_time_unix_nano: v.end_time_unix_nano,
            attributes: v.attributes.into_iter().map(Into::into).collect(),
            dropped_attributes_count: v.dropped_attributes_count,
            events: v.events.into_iter().map(Into::into).collect(),
            dropped_events_count: v.dropped_events_count,
            links: v
                .links
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            dropped_links_count: v.dropped_links_count,
            status: v.status.map(Into::into),
        })
    }
}

impl From<EventJson> for trace::span::Event {
    fn from(v: EventJson) -> Self {
        Self {
            time_unix_nano: v.time_unix_nano,
            name: v.name,
            attributes: v.attributes.into_iter().map(Into::into).collect(),
            dropped_attributes_count: v.dropped_attributes_count,
        }
    }
}

impl TryFrom<LinkJson> for trace::span::Link {
    type Error = JsonDecodeError;

    fn try_from(v: LinkJson) -> Result<Self, Self::Error> {
        Ok(Self {
            trace_id: decode_id_field("link.trace_id", &v.trace_id, 16, false)?,
            span_id: decode_id_field("link.span_id", &v.span_id, 8, false)?,
            trace_state: v.trace_state,
            attributes: v.attributes.into_iter().map(Into::into).collect(),
            dropped_attributes_count: v.dropped_attributes_count,
            flags: v.flags,
        })
    }
}

impl From<StatusJson> for trace::Status {
    fn from(v: StatusJson) -> Self {
        Self {
            message: v.message,
            code: v.code,
        }
    }
}

impl From<KeyValueJson> for common::KeyValue {
    fn from(v: KeyValueJson) -> Self {
        Self {
            key: v.key,
            value: v.value.map(Into::into),
        }
    }
}

impl From<AnyValueJson> for common::AnyValue {
    fn from(v: AnyValueJson) -> Self {
        use common::any_value::Value;
        let value = match v {
            AnyValueJson::String(s) => Value::StringValue(s),
            AnyValueJson::Bool(b) => Value::BoolValue(b),
            AnyValueJson::Int(i) => Value::IntValue(i),
            AnyValueJson::Double(d) => Value::DoubleValue(d),
            AnyValueJson::Array(a) => Value::ArrayValue(common::ArrayValue {
                values: a.values.into_iter().map(Into::into).collect(),
            }),
            AnyValueJson::KvList(kv) => Value::KvlistValue(common::KeyValueList {
                values: kv.values.into_iter().map(Into::into).collect(),
            }),
            // OTLP/JSON spec says base64; browser/JS SDKs emit any of standard /
            // URL-safe / padded / unpadded. Try all four before giving up. A truly
            // unrecognisable payload zeroes the value (with a warn log) rather than
            // dropping the whole batch over one bad attribute.
            AnyValueJson::Bytes(b) => Value::BytesValue(decode_bytes_value_lenient(&b)),
        };
        Self { value: Some(value) }
    }
}

// --- helpers -------------------------------------------------------------

/// Try every base64 alphabet/padding combo in use across SDKs (standard padded,
/// standard unpadded, URL-safe padded, URL-safe unpadded). Falls back to an
/// empty Vec with a warn so corruption is observable but a single bad attribute
/// doesn't drop the whole batch.
fn decode_bytes_value_lenient(s: &str) -> Vec<u8> {
    use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD};
    let bytes = s.as_bytes();
    for engine in [&STANDARD, &URL_SAFE] {
        if let Ok(v) = engine.decode(bytes) {
            return v;
        }
    }
    for engine in [&STANDARD_NO_PAD, &URL_SAFE_NO_PAD] {
        if let Ok(v) = engine.decode(bytes) {
            return v;
        }
    }
    log::warn!("OTLP/JSON bytesValue base64 decode failed across all alphabets");
    Vec::new()
}

/// Decode an OTLP/JSON id (hex per spec, but real-world clients sometimes send
/// base64 — accept both). 16-byte trace IDs and 8-byte span IDs both have a
/// base64 encoding length that requires `=` padding under STANDARD; some senders
/// strip it, so fall back to STANDARD_NO_PAD before giving up.
///
/// `expected_len` (16 for trace_id, 8 for span/parent/link span_id) is enforced
/// strictly — downstream `Uuid::from_slice` / `span_id_to_uuid` in
/// `traces/spans.rs` panic on a wrong-length slice, so reject here and surface a
/// clean 400. `allow_empty` is true only for `parent_span_id`, which is the sole
/// legitimately-absent id (root spans); the consumer guards that one with an
/// `is_empty()` check before converting to a `Uuid`.
fn decode_id_field(
    field: &'static str,
    s: &str,
    expected_len: usize,
    allow_empty: bool,
) -> Result<Vec<u8>, JsonDecodeError> {
    if s.is_empty() {
        if allow_empty {
            return Ok(Vec::new());
        }
        return Err(JsonDecodeError::Field {
            field,
            message: format!("required {expected_len}-byte id is missing or empty"),
        });
    }
    let bytes = if let Ok(b) = hex::decode(s) {
        b
    } else if let Ok(b) = base64::engine::general_purpose::STANDARD.decode(s.as_bytes()) {
        b
    } else {
        base64::engine::general_purpose::STANDARD_NO_PAD
            .decode(s.as_bytes())
            .map_err(|e| JsonDecodeError::Field {
                field,
                message: format!("not hex or base64: {e}"),
            })?
    };
    if bytes.len() != expected_len {
        return Err(JsonDecodeError::Field {
            field,
            message: format!("expected {expected_len} bytes, got {}", bytes.len()),
        });
    }
    Ok(bytes)
}

/// `fixed64` is JSON-encoded as a decimal string per OTLP/JSON spec; some
/// senders emit raw numbers. Accept both.
fn deserialize_u64_or_string<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    use serde::de::Error;
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Repr {
        Str(String),
        Num(u64),
    }
    match Repr::deserialize(d)? {
        Repr::Str(s) if s.is_empty() => Ok(0),
        Repr::Str(s) => s.parse().map_err(D::Error::custom),
        Repr::Num(n) => Ok(n),
    }
}

/// `int64` attribute values are spec-encoded as strings; accept numbers too.
fn deserialize_i64_or_string_field<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<i64, D::Error> {
    use serde::de::Error;
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Repr {
        Str(String),
        Num(i64),
    }
    match Repr::deserialize(d)? {
        Repr::Str(s) if s.is_empty() => Ok(0),
        Repr::Str(s) => s.parse().map_err(D::Error::custom),
        Repr::Num(n) => Ok(n),
    }
}

/// SpanKind is an enum: per spec serialised as the integer ordinal, but several
/// SDKs emit the canonical string name.
fn deserialize_span_kind<'de, D: serde::Deserializer<'de>>(d: D) -> Result<i32, D::Error> {
    use serde::de::Error;
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Repr {
        Str(String),
        Num(i32),
    }
    match Repr::deserialize(d)? {
        Repr::Num(n) => Ok(n),
        Repr::Str(s) => trace::span::SpanKind::from_str_name(&s)
            .map(|k| k as i32)
            .ok_or_else(|| D::Error::custom(format!("unknown SpanKind: {s}"))),
    }
}

fn deserialize_status_code<'de, D: serde::Deserializer<'de>>(d: D) -> Result<i32, D::Error> {
    use serde::de::Error;
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Repr {
        Str(String),
        Num(i32),
    }
    match Repr::deserialize(d)? {
        Repr::Num(n) => Ok(n),
        Repr::Str(s) => trace::status::StatusCode::from_str_name(&s)
            .map(|c| c as i32)
            .ok_or_else(|| D::Error::custom(format!("unknown StatusCode: {s}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use prost::Message;

    fn json_payload() -> &'static str {
        // Realistic OTLP/HTTP+JSON payload from a browser SDK: hex IDs, stringified
        // nanos, enum names for kind/code, mixed attribute value types, an event,
        // a link, a resource, and a scope.
        r#"{
          "resourceSpans": [{
            "resource": {
              "attributes": [
                {"key": "service.name", "value": {"stringValue": "stagehand-extension"}},
                {"key": "extension.id", "value": {"stringValue": "abcd"}}
              ]
            },
            "scopeSpans": [{
              "scope": {"name": "stagehand", "version": "v4"},
              "spans": [{
                "traceId": "5b8aa5a2d2c872e8321cf37308d69df2",
                "spanId": "051581bf3cb55c13",
                "parentSpanId": "",
                "name": "AIActEvent",
                "kind": "SPAN_KIND_INTERNAL",
                "startTimeUnixNano": "1544712660000000000",
                "endTimeUnixNano": "1544712661000000000",
                "attributes": [
                  {"key": "lmnr.span.type", "value": {"stringValue": "EXECUTOR"}},
                  {"key": "gen_ai.usage.input_tokens", "value": {"intValue": "42"}},
                  {"key": "gen_ai.usage.output_tokens", "value": {"intValue": 7}},
                  {"key": "stagehand.cost", "value": {"doubleValue": 0.0001}},
                  {"key": "stagehand.completed", "value": {"boolValue": true}},
                  {"key": "stagehand.tags", "value": {"arrayValue": {"values": [
                    {"stringValue": "browser"},
                    {"stringValue": "agent"}
                  ]}}}
                ],
                "events": [{
                  "timeUnixNano": "1544712660500000000",
                  "name": "screenshot.captured",
                  "attributes": [
                    {"key": "screenshot.url", "value": {"stringValue": "https://example.com/s.png"}}
                  ]
                }],
                "links": [{
                  "traceId": "5b8aa5a2d2c872e8321cf37308d69df2",
                  "spanId": "ffffffffffffffff"
                }],
                "status": {"code": "STATUS_CODE_OK", "message": ""}
              }]
            }]
          }]
        }"#
    }

    #[test]
    fn decodes_otlp_json() {
        let req = decode_export_trace_service_request(json_payload().as_bytes()).unwrap();
        assert_eq!(req.resource_spans.len(), 1);

        let rs = &req.resource_spans[0];
        let res_attrs = &rs.resource.as_ref().unwrap().attributes;
        assert_eq!(res_attrs[0].key, "service.name");

        let scope = rs.scope_spans[0].scope.as_ref().unwrap();
        assert_eq!(scope.name, "stagehand");

        let span = &rs.scope_spans[0].spans[0];
        assert_eq!(span.name, "AIActEvent");
        assert_eq!(span.trace_id.len(), 16);
        assert_eq!(span.span_id.len(), 8);
        assert!(span.parent_span_id.is_empty());
        assert_eq!(span.kind, trace::span::SpanKind::Internal as i32);
        assert_eq!(span.start_time_unix_nano, 1544712660000000000);
        assert_eq!(span.end_time_unix_nano, 1544712661000000000);
        assert_eq!(span.attributes.len(), 6);
        assert_eq!(span.events.len(), 1);
        assert_eq!(span.events[0].name, "screenshot.captured");
        assert_eq!(span.links.len(), 1);
        assert_eq!(
            span.status.as_ref().unwrap().code,
            trace::status::StatusCode::Ok as i32
        );

        // Attribute value variants survive: stringified int, raw int, double, bool, array.
        let by_key = |k: &str| -> &common::any_value::Value {
            span.attributes
                .iter()
                .find(|kv| kv.key == k)
                .unwrap()
                .value
                .as_ref()
                .unwrap()
                .value
                .as_ref()
                .unwrap()
        };
        assert!(matches!(
            by_key("gen_ai.usage.input_tokens"),
            common::any_value::Value::IntValue(42)
        ));
        assert!(matches!(
            by_key("gen_ai.usage.output_tokens"),
            common::any_value::Value::IntValue(7)
        ));
        assert!(matches!(
            by_key("stagehand.completed"),
            common::any_value::Value::BoolValue(true)
        ));
        match by_key("stagehand.tags") {
            common::any_value::Value::ArrayValue(arr) => assert_eq!(arr.values.len(), 2),
            _ => panic!("expected array value"),
        }
    }

    #[test]
    fn json_and_proto_yield_same_request() {
        // Build the canonical request from the JSON payload, re-encode to proto bytes,
        // decode via the existing prost path, and assert structural equality. This
        // exercises both transports against the same logical input.
        let from_json = decode_export_trace_service_request(json_payload().as_bytes()).unwrap();

        let mut buf = Vec::with_capacity(from_json.encoded_len());
        from_json.encode(&mut buf).unwrap();
        let from_proto = ExportTraceServiceRequest::decode(buf.as_slice()).unwrap();

        assert_eq!(from_json, from_proto);
    }

    #[test]
    fn accepts_base64_ids() {
        // Some OTLP/JSON producers (older Java SDK, custom clients) emit base64
        // instead of hex per the original proto3 JSON mapping.
        let payload = r#"{
          "resourceSpans": [{
            "scopeSpans": [{
              "spans": [{
                "traceId": "W4qlotLIcugyHPNzCNad8g==",
                "spanId": "BRWBvzy1XBM=",
                "name": "x",
                "startTimeUnixNano": "1",
                "endTimeUnixNano": "2"
              }]
            }]
          }]
        }"#;
        let req = decode_export_trace_service_request(payload.as_bytes()).unwrap();
        let span = &req.resource_spans[0].scope_spans[0].spans[0];
        assert_eq!(span.trace_id.len(), 16);
        assert_eq!(span.span_id.len(), 8);
    }

    #[test]
    fn accepts_unpadded_base64_ids() {
        // Some senders strip the base64 padding `=` from IDs. STANDARD rejects it,
        // STANDARD_NO_PAD accepts it.
        let payload = r#"{
          "resourceSpans": [{
            "scopeSpans": [{
              "spans": [{
                "traceId": "W4qlotLIcugyHPNzCNad8g",
                "spanId": "BRWBvzy1XBM",
                "name": "x",
                "startTimeUnixNano": "1",
                "endTimeUnixNano": "2"
              }]
            }]
          }]
        }"#;
        let req = decode_export_trace_service_request(payload.as_bytes()).unwrap();
        let span = &req.resource_spans[0].scope_spans[0].spans[0];
        assert_eq!(span.trace_id.len(), 16);
        assert_eq!(span.span_id.len(), 8);
    }

    #[test]
    fn rejects_wrong_length_ids() {
        // 14-char hex = 7 bytes for trace_id (spec requires 16). Downstream
        // `Uuid::from_slice` would panic; we reject here so the caller sees a 400.
        let payload = r#"{
          "resourceSpans": [{
            "scopeSpans": [{
              "spans": [{
                "traceId": "0102030405060708090a0b0c0d0e",
                "spanId": "0102030405060708",
                "name": "x",
                "startTimeUnixNano": "1",
                "endTimeUnixNano": "2"
              }]
            }]
          }]
        }"#;
        let err = decode_export_trace_service_request(payload.as_bytes()).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("trace_id"), "got: {msg}");
        assert!(msg.contains("expected 16 bytes"), "got: {msg}");

        // 6-byte span_id (spec requires 8).
        let payload = r#"{
          "resourceSpans": [{
            "scopeSpans": [{
              "spans": [{
                "traceId": "0102030405060708090a0b0c0d0e0f10",
                "spanId": "010203040506",
                "name": "x",
                "startTimeUnixNano": "1",
                "endTimeUnixNano": "2"
              }]
            }]
          }]
        }"#;
        let err = decode_export_trace_service_request(payload.as_bytes()).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("span_id"), "got: {msg}");
        assert!(msg.contains("expected 8 bytes"), "got: {msg}");
    }

    #[test]
    fn rejects_empty_trace_and_span_ids() {
        // Empty `traceId` / `spanId` previously slipped through (the empty-string
        // bypass skipped the length check), then panicked downstream in
        // `Span::from_otel_span` via `Uuid::from_slice` / `span_id_to_uuid`.
        // Now they must surface as a clean 400. Empty `parentSpanId` stays legal —
        // that's root spans and the consumer guards it with an `is_empty()` check.
        let payload = r#"{
          "resourceSpans": [{
            "scopeSpans": [{
              "spans": [{
                "traceId": "",
                "spanId": "0102030405060708",
                "name": "x",
                "startTimeUnixNano": "1",
                "endTimeUnixNano": "2"
              }]
            }]
          }]
        }"#;
        let err = decode_export_trace_service_request(payload.as_bytes()).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("trace_id"), "got: {msg}");

        let payload = r#"{
          "resourceSpans": [{
            "scopeSpans": [{
              "spans": [{
                "traceId": "0102030405060708090a0b0c0d0e0f10",
                "spanId": "",
                "name": "x",
                "startTimeUnixNano": "1",
                "endTimeUnixNano": "2"
              }]
            }]
          }]
        }"#;
        let err = decode_export_trace_service_request(payload.as_bytes()).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("span_id"), "got: {msg}");

        let payload = r#"{
          "resourceSpans": [{
            "scopeSpans": [{
              "spans": [{
                "traceId": "0102030405060708090a0b0c0d0e0f10",
                "spanId": "0102030405060708",
                "parentSpanId": "",
                "name": "x",
                "startTimeUnixNano": "1",
                "endTimeUnixNano": "2"
              }]
            }]
          }]
        }"#;
        let req = decode_export_trace_service_request(payload.as_bytes()).unwrap();
        assert!(req.resource_spans[0].scope_spans[0].spans[0]
            .parent_span_id
            .is_empty());
    }

    #[test]
    fn rejects_garbage_id() {
        let payload = r#"{
          "resourceSpans": [{
            "scopeSpans": [{
              "spans": [{
                "traceId": "not-an-id-!!!",
                "spanId": "0102030405060708",
                "name": "x",
                "startTimeUnixNano": "1",
                "endTimeUnixNano": "2"
              }]
            }]
          }]
        }"#;
        assert!(decode_export_trace_service_request(payload.as_bytes()).is_err());
    }

    #[test]
    fn bytes_value_accepts_url_safe_and_unpadded_base64() {
        // Browser/JS SDKs commonly emit URL-safe base64 (`-`/`_`) and may strip padding.
        // Payload bytes [0xFB, 0xFF, 0xBE] base64-encode as `+/++` (standard) /
        // `-_--` (url-safe) — picked specifically to exercise the alphabet difference.
        let payload = r#"{
          "resourceSpans": [{
            "scopeSpans": [{
              "spans": [{
                "traceId": "0102030405060708090a0b0c0d0e0f10",
                "spanId": "0102030405060708",
                "name": "x",
                "startTimeUnixNano": "1",
                "endTimeUnixNano": "2",
                "attributes": [
                  {"key": "padded.url_safe", "value": {"bytesValue": "-_--"}},
                  {"key": "unpadded.standard", "value": {"bytesValue": "+/++"}},
                  {"key": "unpadded.url_safe", "value": {"bytesValue": "-_--"}}
                ]
              }]
            }]
          }]
        }"#;
        let req = decode_export_trace_service_request(payload.as_bytes()).unwrap();
        let span = &req.resource_spans[0].scope_spans[0].spans[0];
        for kv in &span.attributes {
            match kv.value.as_ref().unwrap().value.as_ref().unwrap() {
                common::any_value::Value::BytesValue(v) => {
                    assert_eq!(v, &vec![0xFB, 0xFF, 0xBE], "key={}", kv.key);
                }
                _ => panic!("expected bytes value for {}", kv.key),
            }
        }
    }

    #[test]
    fn empty_request_is_ok() {
        let req = decode_export_trace_service_request(b"{}").unwrap();
        assert!(req.resource_spans.is_empty());
    }
}
