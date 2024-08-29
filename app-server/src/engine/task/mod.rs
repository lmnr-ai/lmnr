//! Relevant definitions of tasks.
//!
//! # [`Task`]: the basic unit of scheduling
//!
//! A [`Task`] is the basic unit for scheduling execution of a dagrs. [`Task`] itself is a trait and users
//! should use its concrete implementation [`DefaultTask`]. Of course, users can also customize [`Task`],
//! but it should be noted that whether it is the default [`DefaultTask`] or a user-defined task type, they
//! all need to have the following fields:
//! - `id`: type is `usize`. When allocating tasks, there is a global task `id` allocator.
//!   Users can call the `alloc_id()` function to assign ids to tasks, and the obtained `id` type is `usize`.
//! - `name`: type is `String`. This field represents the task name.
//! - `action`: type is [`Action`]. This field is used to store the specific execution logic of the task.
//! - `precursors`: type is `Vec<usize>`. This field is used to store the predecessor task `id` of this task.
//!
//! # [`Action`]: specific logical behavior
//!
//! Each task has an [`Action`] field inside, which stores the specific execution logic of the task.
//! [`Action`] is an enumeration type. For [`Simple`] execution logic, you only need to provide a closure for [`Action`].
//! For slightly more complex execution logic, you can implement the [`Complex`] trait. For detailed analysis,
//! please see the `action` module.
//!
//! # [`Input`] and [`Output`]
//!
//! Each task may produce output and may require the output of its predecessor task as its input.
//! [`Output`] is used to construct and store the output obtained by task execution. [`Input`] is used as a tool
//! to provide users with the output of the predecessor task.
use std::{collections::HashMap, fmt::Debug, sync::Arc};

pub use self::action::{Action, RunOutput, RunnableNode};
pub(crate) use self::state::ExecState;
pub use self::state::State;
use uuid::Uuid;

mod action;
mod state;
/// The Task trait
///
/// Tasks can have many attributes, among which `id`, `name`, `predecessor_tasks`, and
/// `action` attributes are required, and users can also customize some other attributes.
/// [`DefaultTask`] in this module is a [`Task`], the DAG engine uses it as the basic
/// task by default.
///
/// A task must provide methods to obtain precursors and required attributes, just as
/// the methods defined below, users who want to customize tasks must implement these methods.

pub struct Task {
    /// Task id. It is the same as Node id.
    pub id: Uuid,
    /// Get a reference to an executable action.
    pub action: Action,
    /// Task ids of the tasks that must be executed before this task.
    pub prev: Vec<Uuid>,
    /// Task ids of the tasks that must be executed after this task.
    pub next: Vec<Uuid>,
    /// Map from input handle name to input state.
    pub input_states: HashMap<String, Arc<ExecState>>,
}

impl Task {
    pub fn with_action(id: Uuid, action: Action) -> Self {
        let handles_mapping = action.handles_mapping();

        let mut inputs = HashMap::new();
        for (_, handle) in handles_mapping.iter() {
            inputs.insert(
                handle.name_force(),
                Arc::new(ExecState::new_with_resettable(handle.is_cyclic)),
            );
        }

        Self {
            id: id,
            action,
            prev: Vec::new(),
            next: Vec::new(),
            input_states: inputs,
        }
    }

    pub fn add_prev(&mut self, id: Uuid) {
        self.prev.push(id);
    }

    pub fn add_next(&mut self, id: Uuid) {
        self.next.push(id);
    }
}

impl Debug for Task {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "{}", self.id,)
    }
}
