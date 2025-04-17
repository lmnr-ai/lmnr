use anyhow::Result;
use dashmap::DashMap;

use tokio::{sync::mpsc, task::AbortHandle};
use uuid::Uuid;

use super::types::WorkerStreamChunk;

const CHANNEL_CAPACITY: usize = 100;

type AgentSender = mpsc::Sender<Result<WorkerStreamChunk>>;
pub type AgentReceiver = mpsc::Receiver<Result<WorkerStreamChunk>>;

struct AgentChannelState {
    sender: AgentSender,
    /// whether the agent finished running for this user message
    is_ended: bool,
    /// whether the frontend explicitly stopped the agent
    is_stopped: bool,
    abort_handle: Option<AbortHandle>,
}

impl AgentChannelState {
    fn into_stopped(self) -> Self {
        Self {
            sender: self.sender,
            is_ended: self.is_ended,
            is_stopped: true,
            abort_handle: self.abort_handle,
        }
    }
}
enum WorkerState {
    StreamingChannel(AgentChannelState),
    Future(AbortHandle),
}

pub struct AgentManagerWorkers {
    workers: DashMap<Uuid, WorkerState>,
}

impl AgentManagerWorkers {
    pub fn new() -> Self {
        Self {
            workers: DashMap::new(),
        }
    }

    pub fn is_ended(&self, session_id: Uuid) -> bool {
        let worker_state = self.workers.remove(&session_id);

        if let Some(state) = worker_state {
            match state.1 {
                WorkerState::StreamingChannel(ref streaming_state) => {
                    let is_ended = streaming_state.is_ended;
                    if !is_ended {
                        self.workers.insert(session_id, state.1);
                    }
                    is_ended
                }
                WorkerState::Future(_) => {
                    log::error!(
                        "AgentManagerChannel: trying to check if a non-streaming worker is ended"
                    );
                    self.workers.insert(session_id, state.1);
                    false
                }
            }
        } else {
            false
        }
    }

    pub fn is_stopped(&self, session_id: Uuid) -> bool {
        self.workers
            .get(&session_id)
            .map_or(false, |state| match state.value() {
                WorkerState::StreamingChannel(streaming_state) => streaming_state.is_stopped,
                WorkerState::Future(_) => {
                    log::error!(
                        "AgentManagerChannel: trying to check if a non-streaming worker is stopped"
                    );
                    false
                }
            })
    }

    pub fn create_channel_and_get_rx(&self, session_id: Uuid) -> AgentReceiver {
        let (sender, receiver) = mpsc::channel(CHANNEL_CAPACITY);
        self.workers.insert(
            session_id,
            WorkerState::StreamingChannel(AgentChannelState {
                sender,
                is_ended: false,
                is_stopped: false,
                abort_handle: None,
            }),
        );
        receiver
    }

    pub fn insert_abort_handle(&self, session_id: Uuid, abort_handle: AbortHandle) {
        self.workers
            .entry(session_id)
            .and_modify(|state| match state {
                WorkerState::StreamingChannel(streaming_state) => {
                    streaming_state.abort_handle = Some(abort_handle.clone());
                }
                WorkerState::Future(_) => {}
            })
            .or_insert(WorkerState::Future(abort_handle));
    }

    pub async fn try_publish(
        &self,
        session_id: Uuid,
        chunk: Result<WorkerStreamChunk>,
    ) -> Result<()> {
        // Completely remove the state first to avoid deadlocks
        let Some(state) = self.workers.remove(&session_id) else {
            log::debug!("AgentManagerChannel: try_publish: session_id not found");
            return Err(anyhow::anyhow!(
                "AgentManagerChannel: try_publish: session_id not found"
            ));
        };

        let sender = match state.1 {
            WorkerState::StreamingChannel(ref state) => state.sender.clone(),
            WorkerState::Future(_) => {
                log::error!("AgentManagerChannel: trying to publish to a non-streaming worker");
                return Err(anyhow::anyhow!(
                    "AgentManagerChannel: trying to publish to a non-streaming worker"
                ));
            }
        };

        let is_err = chunk.is_err();

        // Insert the state back into the map if the send was successful
        if sender.send(chunk).await.is_ok() {
            self.workers.insert(session_id, state.1);
        } else {
            log::debug!("AgentManagerChannel: client is disconnected");
            return Err(anyhow::anyhow!(
                "AgentManagerChannel: client is disconnected"
            ));
        }

        if is_err {
            self.end_session(session_id);
        }

        Ok(())
    }

    pub fn end_session(&self, session_id: Uuid) {
        self.workers.remove_if(&session_id, |_, state| match state {
            WorkerState::Future(f) => {
                f.abort();
                true
            }
            _ => false,
        });

        self.workers
            .get_mut(&session_id)
            .map(|mut state| match state.value_mut() {
                WorkerState::StreamingChannel(streaming_state) => {
                    streaming_state.is_ended = true;
                    if let Some(abort_handle) = &streaming_state.abort_handle {
                        abort_handle.abort();
                    }
                }
                WorkerState::Future(_) => {}
            });
    }

    pub async fn stop_session(&self, session_id: Uuid) {
        if let Some((_, state)) = self.workers.remove(&session_id) {
            match state {
                WorkerState::StreamingChannel(streaming_state) => {
                    if let Some(abort_handle) = &streaming_state.abort_handle {
                        abort_handle.abort();
                    }
                    self.workers.insert(
                        session_id,
                        WorkerState::StreamingChannel(streaming_state.into_stopped()),
                    );
                }
                WorkerState::Future(f) => {
                    f.abort();
                }
            }
        }
    }
}
