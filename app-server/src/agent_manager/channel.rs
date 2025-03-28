use anyhow::Result;
use dashmap::DashMap;
use tokio::sync::mpsc;
use uuid::Uuid;

use super::types::{ControlChunk, WorkerStreamChunk};

const CHANNEL_CAPACITY: usize = 100;

type AgentSender = mpsc::Sender<Result<WorkerStreamChunk>>;
pub type AgentReceiver = mpsc::Receiver<Result<WorkerStreamChunk>>;

struct AgentChannelState {
    sender: AgentSender,
    /// whether the agent finished running for this user message
    is_ended: bool,
    /// whether the frontend explicitly stopped the agent
    is_stopped: bool,
}

pub struct AgentManagerChannel {
    channels: DashMap<Uuid, AgentChannelState>,
}

impl AgentManagerChannel {
    pub fn new() -> Self {
        Self {
            channels: DashMap::new(),
        }
    }

    pub fn is_ended(&self, session_id: Uuid) -> bool {
        let channel_state = self.channels.remove(&session_id);

        if let Some(state) = channel_state {
            let is_ended = state.1.is_ended;
            if !is_ended {
                self.channels.insert(session_id, state.1);
            }
            is_ended
        } else {
            false
        }
    }

    pub fn is_stopped(&self, session_id: Uuid) -> bool {
        self.channels
            .get(&session_id)
            .map_or(false, |state| state.is_stopped)
    }

    pub fn create_channel_and_get_rx(&self, session_id: Uuid) -> AgentReceiver {
        let (sender, receiver) = mpsc::channel(CHANNEL_CAPACITY);
        self.channels.insert(
            session_id,
            AgentChannelState {
                sender,
                is_ended: false,
                is_stopped: false,
            },
        );
        receiver
    }

    pub async fn try_publish(
        &self,
        session_id: Uuid,
        chunk: Result<WorkerStreamChunk>,
    ) -> Result<()> {
        // Completely remove the state first to avoid deadlocks
        let Some(state) = self.channels.remove(&session_id) else {
            log::debug!("AgentManagerChannel: try_publish: session_id not found");
            return Err(anyhow::anyhow!(
                "AgentManagerChannel: try_publish: session_id not found"
            ));
        };

        // Insert the state back into the map if the send was successful
        if state.1.sender.send(chunk).await.is_ok() {
            self.channels.insert(session_id, state.1);
        } else {
            log::debug!("AgentManagerChannel: client is disconnected");
        }

        Ok(())
    }

    pub fn end_session(&self, session_id: Uuid) {
        self.channels.get_mut(&session_id).map(|mut state| {
            state.value_mut().is_ended = true;
        });
    }

    pub async fn stop_session(&self, session_id: Uuid) {
        if let Some(mut state) = self.channels.get_mut(&session_id) {
            state
                .sender
                .send(Ok(WorkerStreamChunk::ControlChunk(ControlChunk::Stop)))
                .await
                .unwrap_or_default();
            state.value_mut().is_stopped = true;
        }
    }
}
