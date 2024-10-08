use crate::{
    engine::{
        task::{State, Task},
        RunOutput,
    },
    pipeline::{
        context::Context,
        nodes::{BreakpointChunk, Message, NodeInput, NodeStreamChunk, NodeStreamEnd, StreamChunk},
        trace::MetaLog,
    },
    routes::pipelines::GraphInterruptMessage,
};
use chrono::Utc;
use dashmap::{DashMap, DashSet};
use futures::FutureExt;
use log::{debug, error};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    panic::AssertUnwindSafe,
    sync::Arc,
};
use tokio::sync::mpsc::{Receiver, Sender};
use tokio::task::JoinHandle;
use uuid::Uuid;

pub struct Engine {
    /// Store all tasks.
    tasks: Arc<DashMap<Uuid, Arc<Task>>>,
    /// Store the tasks that are currently being executed.
    active_tasks: Arc<DashSet<Uuid>>,
    /// Idle tasks waiting for all their inputs to be filled.
    idle_tasks: Arc<DashSet<Uuid>>,
    /// Global environment variables for this Dag job. It should be set before the Dag job runs.
    context: Arc<Context>,
    /// Store the execution depth of each task in the graph.
    depths: Arc<DashMap<Uuid, usize>>,
    /// Store all messages generated by the tasks.
    node_messages: Arc<DashMap<Uuid, Message>>,
    /// Store the ids of the output messages.
    output_ids: Arc<DashSet<Uuid>>,
    /// Store the handles of the tasks that are currently being executed.
    handles: Arc<DashMap<Uuid, JoinHandle<()>>>,
    /// Semaphore to control the number of active tasks.
    control_semaphore: Arc<tokio::sync::Semaphore>,
    /// Tasks which will stop the execution of the graph and wait until continue signal is received.
    breakpoint_task_ids: Arc<DashSet<Uuid>>,
}

#[derive(Debug)]
enum ScheduledTask {
    Task(Uuid),
    // id of the task that failed
    Err,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineOutput {
    pub output_message_ids: Vec<Uuid>,
    pub messages: HashMap<Uuid, Message>,
}

impl EngineOutput {
    pub fn output_values(&self) -> HashMap<String, NodeInput> {
        self.output_message_ids
            .iter()
            .map(|id| {
                let message = self.messages.get(id).unwrap();
                (message.node_name.clone(), message.value.clone())
            })
            .collect()
    }
}

impl Engine {
    fn new(context: Context) -> Engine {
        Engine {
            tasks: Arc::new(DashMap::new()),
            active_tasks: Arc::new(DashSet::new()),
            idle_tasks: Arc::new(DashSet::new()),
            node_messages: Arc::new(DashMap::new()),
            context: Arc::new(context),
            depths: Arc::new(DashMap::new()),
            output_ids: Arc::new(DashSet::new()),
            handles: Arc::new(DashMap::new()),
            control_semaphore: Arc::new(tokio::sync::Semaphore::new(20)),
            breakpoint_task_ids: Arc::new(DashSet::new()),
        }
    }

    /// Create an engine with context and tasks.
    pub fn with_tasks_and_context(
        tasks: HashMap<Uuid, Task>,
        context: Context,
        prefilled_messages: Option<Vec<Message>>,
        start_task_id: Option<Uuid>,
        breakpoint_task_ids: Option<Vec<Uuid>>,
    ) -> Engine {
        let engine = Engine::new(context);

        if let Some(breakpoint_task_ids) = breakpoint_task_ids {
            for task_id in breakpoint_task_ids {
                engine.breakpoint_task_ids.insert(task_id);
            }
        }

        for (id, task) in tasks {
            engine.tasks.insert(id, Arc::new(task));
            engine.depths.insert(id.clone(), 0);
        }

        if let (Some(prefilled_messages), Some(start_task_id)) = (prefilled_messages, start_task_id)
        {
            for message in prefilled_messages {
                let task = engine.tasks.get(&message.node_id).unwrap().clone();

                // prefill next tasks with the message
                for next_task_id in task.next.iter() {
                    let next_task = engine.tasks.get(next_task_id).unwrap().clone();

                    let handle_names = next_task
                        .action
                        .handles_mapping()
                        .iter()
                        .filter(|(k, _)| *k == task.action.output_handle_id())
                        .map(|(_, v)| v.clone())
                        .collect::<Vec<_>>();

                    for handle in handle_names.iter() {
                        let next_state = next_task
                            .input_states
                            .get(&handle.name_force())
                            .unwrap()
                            .clone();
                        next_state.set_state_and_permits(State::new(message.clone()), 1);
                    }
                }
            }
            // reset all input_states
            let mut visited = HashSet::new();
            engine.propagate_reset_input_states(start_task_id, start_task_id, &mut visited);
        }

        engine
    }

    fn propagate_reset_input_states(
        &self,
        task_id: Uuid,
        start_task_id: Uuid,
        visited: &mut HashSet<Uuid>,
    ) {
        let task = self.tasks.get(&task_id).unwrap().clone();

        for next_task_id in task.next.iter() {
            if next_task_id == &start_task_id {
                return;
            }

            if visited.contains(next_task_id) {
                continue;
            }

            let next_task = self.tasks.get(next_task_id).unwrap().clone();

            let handle_names = next_task
                .action
                .handles_mapping()
                .iter()
                .filter(|(k, _)| *k == task.action.output_handle_id())
                .map(|(_, v)| v.clone())
                .collect::<Vec<_>>();

            for handle in handle_names.iter() {
                let next_state = next_task
                    .input_states
                    .get(&handle.name_force())
                    .unwrap()
                    .clone();
                next_state.set_state_and_permits(State::empty(), 1);
            }

            visited.insert(next_task_id.clone());
            self.propagate_reset_input_states(*next_task_id, start_task_id, visited);
        }
    }

    /// Start task scheduler and execute tasks.
    pub async fn run(
        &mut self,
        stream_send: Option<Sender<StreamChunk>>,
        interrupt_recv: Option<Receiver<GraphInterruptMessage>>,
        start_task_id: Option<Uuid>,
    ) -> Result<EngineOutput, EngineOutput> {
        let (task_send, mut task_recv) = tokio::sync::mpsc::channel::<ScheduledTask>(10);

        let input_tasks = if let Some(start_task_id) = start_task_id {
            vec![start_task_id]
        } else {
            self.tasks
                .iter()
                .filter(|task| task.prev.is_empty())
                .map(|task| task.id)
                .collect::<Vec<_>>()
        };

        // push input tasks to the channel
        let tx = task_send.clone();
        tokio::spawn(async move {
            for task_id in input_tasks {
                tx.send(ScheduledTask::Task(task_id)).await.unwrap();
            }
        });

        if let Some(mut interrupt_recv) = interrupt_recv {
            let tx = task_send.clone();
            let active_tasks = self.active_tasks.clone();
            let handles = self.handles.clone();
            let control_semaphore = self.control_semaphore.clone();
            tokio::spawn(async move {
                while let Some(interrupt) = interrupt_recv.recv().await {
                    if matches!(interrupt, GraphInterruptMessage::Cancel) {
                        active_tasks.clear();
                        handles.iter().for_each(|handle| handle.abort());

                        tx.send(ScheduledTask::Err).await.unwrap();
                    } else if matches!(interrupt, GraphInterruptMessage::Continue) {
                        // continue execution
                        control_semaphore.add_permits(20);
                    }
                }
            });
        }

        loop {
            if let Some(task) = task_recv.recv().await {
                match task {
                    ScheduledTask::Task(task_id) => {
                        // awaiting only output nodes to check if we can stop execution
                        // if task doesn't have any next tasks it means it's an output node
                        let task = self.tasks.get(&task_id).unwrap().clone();

                        if task.next.is_empty() {
                            match self
                                .execute_task(task, task_send.clone(), stream_send.clone())
                                .await
                            {
                                Ok(_) => {
                                    // if all active tasks are done, break
                                    // idle tasks often follow conditional nodes and will never get an input
                                    if self.active_tasks.is_empty()
                                        && !self.idle_tasks.iter().any(|task_id| {
                                            let task = self.tasks.get(task_id.as_ref()).unwrap();
                                            task.input_states
                                                .values()
                                                .all(|state| state.get_state().is_success())
                                        })
                                    {
                                        for task_id in self.idle_tasks.iter() {
                                            if let Some(handle) = self.handles.get(&task_id) {
                                                handle.abort();
                                            }
                                        }
                                        return Ok(self.get_outputs());
                                    }
                                }
                                Err(err) => {
                                    error!(
                                        "Task execution encountered an unexpected error! {}",
                                        err
                                    );
                                    // TODO: handle error
                                    self.handles.iter().for_each(|handle| handle.abort());
                                    return Err(self.get_outputs());
                                }
                            }
                        } else {
                            let handle =
                                self.execute_task(task, task_send.clone(), stream_send.clone());
                            self.handles.insert(task_id, handle);
                        }
                    }
                    ScheduledTask::Err => {
                        self.handles.iter().for_each(|handle| handle.abort());

                        return Err(self.get_outputs());
                    }
                }
            }
        }
    }

    /// Start a new thread to execute a given task asynchronously.
    fn execute_task(
        &self,
        task: Arc<Task>,
        task_send: Sender<ScheduledTask>,
        stream_send: Option<Sender<StreamChunk>>,
    ) -> JoinHandle<()> {
        let context = self.context.clone();
        let task_id = task.id;
        let action = task.action.clone();
        let next = task.next.clone();
        let input_states = task.input_states.clone();
        let active_tasks = self.active_tasks.clone();
        let idle_tasks = self.idle_tasks.clone();
        let tasks = self.tasks.clone();
        let depths = self.depths.clone();
        let depth = depths.get(&task_id).unwrap().clone();
        let output_ids = self.output_ids.clone();
        let node_messages = self.node_messages.clone();
        let control_semaphore = self.control_semaphore.clone();
        let breakpoint_task_ids = self.breakpoint_task_ids.clone();

        tokio::spawn(async move {
            // acquire semaphore to control the number of active tasks
            let control_permit = control_semaphore.acquire().await.unwrap();

            let mut inputs = HashMap::new();
            let mut input_message_ids = Vec::new();

            // Wait for inputs for this task to be set
            for (handle_name, input_state) in input_states.iter() {
                let _permit = input_state.semaphore().acquire().await.unwrap();

                // Set the outputs of predecessors as inputs of the current
                let output = input_state.get_state();
                let message = output.get_out();

                inputs.insert(handle_name.clone(), message.value.clone());
                input_message_ids.push(message.id);
            }

            // once the task has collected all inputs, we remove it from idle tasks and push to active tasks
            active_tasks.insert(task_id);

            // if task is a breakpoint task, we first remove all permits from the semaphore
            // to stop the execution of the graph
            if breakpoint_task_ids.contains(&task_id) {
                control_semaphore.forget_permits(control_semaphore.available_permits());
            }

            let start_time = Utc::now();

            let mut id = Uuid::new_v4();

            if let Some(stream_send) = stream_send.clone() {
                // send emptry stream chunk to indicate start of the node
                let stream_chunk = StreamChunk::NodeChunk(NodeStreamChunk {
                    id,
                    node_id: action.node_id(),
                    node_name: action.node_name(),
                    node_type: action.node_type(),
                    content: NodeInput::String("".to_string()),
                });

                stream_send.send(stream_chunk).await.unwrap();
            }

            match AssertUnwindSafe(action.run(inputs, context))
                .catch_unwind()
                .await
            {
                Err(_) => {
                    debug!("Execution failed [id: {}]", task_id);
                    let msg_id = Uuid::new_v4();
                    let error = Message {
                        id: msg_id,
                        value: "Unexpected server error".to_string().into(),
                        node_id: action.node_id(),
                        node_name: action.node_name(),
                        node_type: action.node_type(),
                        input_message_ids,
                        meta_log: None,
                        start_time,
                        end_time: Utc::now(),
                    };

                    output_ids.insert(msg_id);
                    node_messages.insert(msg_id, error);
                    idle_tasks.remove(&task_id);

                    task_send.send(ScheduledTask::Err).await.unwrap();

                    // release semaphore
                    drop(control_permit);
                }
                Ok(out) => {
                    match out {
                        Ok(run_output) => {
                            let state = match run_output {
                                RunOutput::Success((value, meta_log)) => {
                                    if let Some(meta_log) = meta_log.clone() {
                                        match meta_log {
                                            MetaLog::LLM(llm_meta_log) => {
                                                // In streaming, this is used instead of node id to identify the node's instance
                                                // When we have cycle, node's instances can be repeated
                                                id = llm_meta_log.node_chunk_id.unwrap();
                                            }
                                            MetaLog::Zenguard(_)
                                            | MetaLog::Subpipeline(_)
                                            | MetaLog::Map(_) => {}
                                        }
                                    }
                                    let message = Message {
                                        id,
                                        value,
                                        node_id: action.node_id(),
                                        node_name: action.node_name(),
                                        node_type: action.node_type(),
                                        input_message_ids: input_message_ids.clone(),
                                        meta_log,
                                        start_time,
                                        end_time: Utc::now(),
                                    };
                                    node_messages.insert(id, message.clone());

                                    State::new(message)
                                }
                                RunOutput::Termination => State::termination(),
                            };

                            // send to the stream before scheduling next tasks
                            // to ensure the order of the stream
                            if let Some(stream_send) = stream_send.clone() {
                                // check if success, because it can be a termination
                                if state.is_success() {
                                    let stream_chunk = StreamChunk::NodeEnd(NodeStreamEnd {
                                        message: (*state.get_out()).clone(),
                                    });

                                    // TODO: handle unwrap
                                    stream_send.send(stream_chunk).await.unwrap();

                                    if breakpoint_task_ids.contains(&task_id) {
                                        // if task is a breakpoint task, we release all permits from the semaphore
                                        // to stop the execution of the graph

                                        // Wait for continue signal
                                        stream_send
                                            .send(StreamChunk::Breakpoint(BreakpointChunk {
                                                node_id: task_id,
                                            }))
                                            .await
                                            .unwrap();

                                        let _ = control_semaphore.acquire().await.unwrap();
                                    }
                                }
                            }

                            let is_termination = state.is_termination();
                            debug!("Task {} executed", task_id);

                            idle_tasks.remove(&task_id);

                            // terminate graph on recursion depth exceeding 10
                            if depth == 10 {
                                debug!("Max recursion depth exceeded, terminating graph");

                                let msg_id = Uuid::new_v4();

                                let error = Message {
                                    id: msg_id,
                                    value: "Max recursion depth exceeded".to_string().into(),
                                    node_id: action.node_id(),
                                    node_name: action.node_name(),
                                    node_type: action.node_type(),
                                    input_message_ids: input_message_ids.clone(),
                                    meta_log: None,
                                    start_time,
                                    end_time: Utc::now(),
                                };

                                if let Some(stream_send) = stream_send.clone() {
                                    let stream_chunk = StreamChunk::NodeEnd(NodeStreamEnd {
                                        message: error.clone(),
                                    });

                                    stream_send.send(stream_chunk).await.unwrap();
                                }

                                output_ids.insert(msg_id);
                                node_messages.insert(msg_id, error);

                                task_send.send(ScheduledTask::Err).await.unwrap();
                            }

                            if next.is_empty() {
                                // if there are no next tasks, we can terminate the graph
                                let message = state.get_out().as_ref().clone();
                                output_ids.insert(message.id);
                                node_messages.insert(message.id, message);
                            }

                            // push next tasks to the channel only if the current task is not a termination
                            for next_task_id in next.iter() {
                                if is_termination {
                                    break;
                                }

                                // we set the inputs of the next tasks to the outputs of the current task
                                let next_task = tasks.get(next_task_id).unwrap().clone();

                                // in majority of cases there will be only one handle name
                                // however we need to handle the case when single output is mapped to multiple inputs on the next node
                                let handle_names = next_task
                                    .action
                                    .handles_mapping()
                                    .iter()
                                    .filter(|(k, _)| *k == action.output_handle_id())
                                    .map(|(_, v)| v.clone())
                                    .collect::<Vec<_>>();

                                for handle in handle_names.iter() {
                                    let next_state = next_task
                                        .input_states
                                        .get(&handle.name_force())
                                        .unwrap()
                                        .clone();
                                    next_state.set_state_and_permits(state.clone(), 1);
                                }

                                // push next tasks to the channel only if the task is not active and current task is not a termination
                                if !idle_tasks.contains(next_task_id) {
                                    idle_tasks.insert(*next_task_id);
                                    task_send
                                        .send(ScheduledTask::Task(*next_task_id))
                                        .await
                                        .unwrap();
                                }
                            }

                            // reset the inputs of the current task if they are resettable.
                            // This prevents the task from being executed again with the same inputs
                            // instead of waiting for new inputs
                            for input_state in input_states.values() {
                                if input_state.is_resettable() {
                                    input_state.set_state(State::empty());
                                    input_state.semaphore().forget_permits(1);
                                }
                            }

                            // remove the task from active tasks once it's done, and has pushed next tasks to idle tasks and the channel
                            active_tasks.remove(&task_id);

                            // increment depth of the finished task
                            depths.insert(task_id, depth + 1);

                            // release semaphore
                            drop(control_permit);
                        }
                        Err(err) => {
                            debug!("Execution failed [id: {}], err: {}", task_id, err);

                            let msg_id = Uuid::new_v4();

                            let error = Message {
                                id: msg_id,
                                value: err.to_string().into(),
                                node_id: action.node_id(),
                                node_name: action.node_name(),
                                node_type: action.node_type(),
                                input_message_ids,
                                meta_log: None,
                                start_time,
                                end_time: Utc::now(),
                            };

                            if let Some(stream_send) = stream_send {
                                let stream_chunk = StreamChunk::NodeEnd(NodeStreamEnd {
                                    message: error.clone(),
                                });

                                stream_send.send(stream_chunk).await.unwrap();
                            }

                            output_ids.insert(msg_id);
                            node_messages.insert(msg_id, error);

                            // terminate entire graph by sending err task
                            task_send.send(ScheduledTask::Err).await.unwrap();
                            active_tasks.remove(&task_id);

                            // release semaphore
                            drop(control_permit);
                        }
                    }
                }
            }
        })
    }

    fn get_outputs(&self) -> EngineOutput {
        EngineOutput {
            messages: self
                .node_messages
                .iter()
                .map(|entry| (entry.key().to_owned(), entry.value().to_owned()))
                .collect(),
            output_message_ids: self.output_ids.as_ref().clone().into_iter().collect(),
        }
    }
}
