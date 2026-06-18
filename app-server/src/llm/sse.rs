#![cfg_attr(not(feature = "signals"), allow(dead_code))]

use bytes::Bytes;
use eventsource_stream::{EventStreamError, Eventsource};
use futures_util::{Stream, StreamExt};
use serde::de::DeserializeOwned;
use tokio::sync::mpsc::UnboundedSender;

use crate::llm::models::{ProviderResponse, ProviderStreamChunk};

pub(crate) trait StreamAccumulator: Default {
    type Chunk: DeserializeOwned;
    fn ingest(&mut self, chunk: Self::Chunk, tx: &UnboundedSender<ProviderStreamChunk>);
    fn into_response(self, model: &str) -> ProviderResponse;
}

pub(crate) async fn accumulate_sse<A, E>(
    byte_stream: impl Stream<Item = reqwest::Result<Bytes>>,
    model: &str,
    tx: &UnboundedSender<ProviderStreamChunk>,
) -> Result<ProviderResponse, E>
where
    A: StreamAccumulator,
    E: From<reqwest::Error> + From<serde_json::Error>,
{
    let mut accumulator = A::default();
    let mut payloads = Box::pin(sse_data_stream(byte_stream));
    while let Some(payload) = payloads.next().await {
        let chunk: A::Chunk = serde_json::from_str(&payload?)?;
        accumulator.ingest(chunk, tx);
    }
    Ok(accumulator.into_response(model))
}

fn sse_data_stream(
    byte_stream: impl Stream<Item = reqwest::Result<Bytes>>,
) -> impl Stream<Item = reqwest::Result<String>> {
    byte_stream.eventsource().filter_map(|event| async move {
        match event {
            Ok(event) => {
                let data = event.data;
                let trimmed = data.trim();
                if trimmed.is_empty() || trimmed == "[DONE]" {
                    None
                } else {
                    Some(Ok(data))
                }
            }
            Err(EventStreamError::Transport(e)) => Some(Err(e)),
            Err(EventStreamError::Utf8(_) | EventStreamError::Parser(_)) => None,
        }
    })
}
