use dashmap::DashMap;
use tokio::sync::mpsc;
use uuid::Uuid;

use super::types::RunAgentResponseStreamChunk;

const CHANNEL_CAPACITY: usize = 100;

pub struct AgentManagerChannel {
    pub channels: DashMap<Uuid, mpsc::Sender<RunAgentResponseStreamChunk>>,
}

impl AgentManagerChannel {
    pub fn new() -> Self {
        Self {
            channels: DashMap::new(),
        }
    }

    pub fn create_channel_and_get_rx(
        &self,
        chat_id: Uuid,
    ) -> mpsc::Receiver<RunAgentResponseStreamChunk> {
        let (sender, receiver) = mpsc::channel(CHANNEL_CAPACITY);
        self.channels.insert(chat_id, sender);
        receiver
    }

    pub async fn try_publish(&self, chat_id: Uuid, chunk: RunAgentResponseStreamChunk) {
        let Some(sender) = self.channels.get(&chat_id) else {
            log::warn!("AgentManagerChannel: try_publish: chat_id not found");
            return;
        };

        sender
            .send(chunk)
            .await
            .map_err(|e| {
                log::debug!("AgentManagerChannel: try_publish: {}", e);
                self.channels.remove(&chat_id);
            })
            .unwrap_or_default();
    }
}
