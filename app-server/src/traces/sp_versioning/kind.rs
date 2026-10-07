//! The two kinds of text this pipeline versions, and everything that differs
//! between them. The algorithm (window, registry, cheap match, probe, mint) is
//! shared and takes a [`VersionKind`]; per-kind behaviour lives here as data so
//! the shared code carries no kind branches.
//!
//! - `SystemPrompt` — an agent's system prompt. Consumed by signals (the
//!   summarizer's static resolution, via the removal-regex list).
//! - `UserTemplate` — the last-turn user group of a trace's winning LLM span.
//!   Keys user-task extraction regexes (`input_extraction`).
//!
//! Each kind has its own queue, Redis key space, tunables and ClickHouse tables,
//! so the two never share state.

use std::sync::LazyLock;

use crate::cache::keys::{
    SYSTEM_PROMPT_PROBE_CACHE_KEY, SYSTEM_PROMPT_VERSION_LINES_CACHE_KEY,
    SYSTEM_PROMPT_VERSION_LOCK_CACHE_KEY, SYSTEM_PROMPT_VERSION_MEMO_CACHE_KEY,
    SYSTEM_PROMPT_VERSIONS_CACHE_KEY, SYSTEM_PROMPT_WINDOW_CACHE_KEY,
    SYSTEM_PROMPT_WINDOW_LINES_CACHE_KEY, USER_TEMPLATE_PROBE_CACHE_KEY,
    USER_TEMPLATE_VERSION_LINES_CACHE_KEY, USER_TEMPLATE_VERSION_LOCK_CACHE_KEY,
    USER_TEMPLATE_VERSION_MEMO_CACHE_KEY, USER_TEMPLATE_VERSIONS_CACHE_KEY,
    USER_TEMPLATE_WINDOW_CACHE_KEY, USER_TEMPLATE_WINDOW_LINES_CACHE_KEY,
};
use crate::env;

use super::{
    SP_VERSIONING_DELAY_EXCHANGE, SP_VERSIONING_DELAY_QUEUE, SP_VERSIONING_DELAY_ROUTING_KEY,
    SP_VERSIONING_EXCHANGE, SP_VERSIONING_QUEUE, SP_VERSIONING_ROUTING_KEY,
    USER_TEMPLATE_VERSIONING_DELAY_EXCHANGE, USER_TEMPLATE_VERSIONING_DELAY_QUEUE,
    USER_TEMPLATE_VERSIONING_DELAY_ROUTING_KEY, USER_TEMPLATE_VERSIONING_EXCHANGE,
    USER_TEMPLATE_VERSIONING_QUEUE, USER_TEMPLATE_VERSIONING_ROUTING_KEY,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VersionKind {
    SystemPrompt,
    UserTemplate,
}

/// Redis key prefixes. Every key is `{prefix}:{project_id}:…`.
pub struct KeyPrefixes {
    pub registry: &'static str,
    pub version_lines: &'static str,
    pub window: &'static str,
    pub window_lines: &'static str,
    pub memo: &'static str,
    pub mint_lock: &'static str,
    pub probe: &'static str,
}

pub struct Tunables {
    pub window_size: usize,
    pub window_max_age_seconds: i64,
    pub window_min_entries: usize,
    pub min_window: usize,
    pub top_k_percent: usize,
    pub full_run_interval_seconds: u64,
}

/// The classifier queue plus its consumer-less park queue, which dead-letters
/// back into `exchange`.
pub struct Queues {
    pub queue: &'static str,
    pub exchange: &'static str,
    pub routing_key: &'static str,
    pub delay_queue: &'static str,
    pub delay_exchange: &'static str,
    pub delay_routing_key: &'static str,
}

pub struct Tables {
    /// One row per resolved span.
    pub versions: &'static str,
    /// One row per mint: the version's static text and provenance.
    pub defs: &'static str,
}

const SYSTEM_PROMPT_KEYS: KeyPrefixes = KeyPrefixes {
    registry: SYSTEM_PROMPT_VERSIONS_CACHE_KEY,
    version_lines: SYSTEM_PROMPT_VERSION_LINES_CACHE_KEY,
    window: SYSTEM_PROMPT_WINDOW_CACHE_KEY,
    window_lines: SYSTEM_PROMPT_WINDOW_LINES_CACHE_KEY,
    memo: SYSTEM_PROMPT_VERSION_MEMO_CACHE_KEY,
    mint_lock: SYSTEM_PROMPT_VERSION_LOCK_CACHE_KEY,
    probe: SYSTEM_PROMPT_PROBE_CACHE_KEY,
};

const USER_TEMPLATE_KEYS: KeyPrefixes = KeyPrefixes {
    registry: USER_TEMPLATE_VERSIONS_CACHE_KEY,
    version_lines: USER_TEMPLATE_VERSION_LINES_CACHE_KEY,
    window: USER_TEMPLATE_WINDOW_CACHE_KEY,
    window_lines: USER_TEMPLATE_WINDOW_LINES_CACHE_KEY,
    memo: USER_TEMPLATE_VERSION_MEMO_CACHE_KEY,
    mint_lock: USER_TEMPLATE_VERSION_LOCK_CACHE_KEY,
    probe: USER_TEMPLATE_PROBE_CACHE_KEY,
};

static SYSTEM_PROMPT_TUNABLES: LazyLock<Tunables> = LazyLock::new(|| Tunables {
    window_size: env::static_sp::WINDOW_SIZE.get(),
    window_max_age_seconds: env::static_sp::WINDOW_MAX_AGE_SECONDS.get(),
    window_min_entries: env::static_sp::WINDOW_MIN_ENTRIES.get(),
    min_window: env::static_sp::MIN_WINDOW.get(),
    top_k_percent: env::static_sp::TOP_K_PERCENT.get(),
    full_run_interval_seconds: env::static_sp::FULL_RUN_INTERVAL_SECONDS.get(),
});

static USER_TEMPLATE_TUNABLES: LazyLock<Tunables> = LazyLock::new(|| Tunables {
    window_size: env::user_template::WINDOW_SIZE.get(),
    window_max_age_seconds: env::user_template::WINDOW_MAX_AGE_SECONDS.get(),
    window_min_entries: env::user_template::WINDOW_MIN_ENTRIES.get(),
    min_window: env::user_template::MIN_WINDOW.get(),
    top_k_percent: env::user_template::TOP_K_PERCENT.get(),
    full_run_interval_seconds: env::user_template::FULL_RUN_INTERVAL_SECONDS.get(),
});

const SYSTEM_PROMPT_QUEUES: Queues = Queues {
    queue: SP_VERSIONING_QUEUE,
    exchange: SP_VERSIONING_EXCHANGE,
    routing_key: SP_VERSIONING_ROUTING_KEY,
    delay_queue: SP_VERSIONING_DELAY_QUEUE,
    delay_exchange: SP_VERSIONING_DELAY_EXCHANGE,
    delay_routing_key: SP_VERSIONING_DELAY_ROUTING_KEY,
};

const USER_TEMPLATE_QUEUES: Queues = Queues {
    queue: USER_TEMPLATE_VERSIONING_QUEUE,
    exchange: USER_TEMPLATE_VERSIONING_EXCHANGE,
    routing_key: USER_TEMPLATE_VERSIONING_ROUTING_KEY,
    delay_queue: USER_TEMPLATE_VERSIONING_DELAY_QUEUE,
    delay_exchange: USER_TEMPLATE_VERSIONING_DELAY_EXCHANGE,
    delay_routing_key: USER_TEMPLATE_VERSIONING_DELAY_ROUTING_KEY,
};

const SYSTEM_PROMPT_TABLES: Tables = Tables {
    versions: "system_prompt_versions",
    defs: "system_prompt_version_defs",
};

const USER_TEMPLATE_TABLES: Tables = Tables {
    versions: "user_template_versions",
    defs: "user_template_version_defs",
};

impl VersionKind {
    pub const ALL: [VersionKind; 2] = [VersionKind::SystemPrompt, VersionKind::UserTemplate];

    /// Short tag for logs.
    pub fn label(self) -> &'static str {
        match self {
            VersionKind::SystemPrompt => "system_prompt",
            VersionKind::UserTemplate => "user_template",
        }
    }

    /// The scope one window and registry cover. System prompts are versioned
    /// per agent. User templates are also split by turn position: a first turn
    /// and a follow-up carry different templates, and mixing them in one
    /// window dilutes each other's clusters.
    pub fn partition(self, agent_hash: &str, has_history: bool) -> String {
        match self {
            VersionKind::SystemPrompt => agent_hash.to_string(),
            VersionKind::UserTemplate => {
                let turn = if has_history { "h" } else { "n" };
                format!("{agent_hash}:{turn}")
            }
        }
    }

    /// Whether versions carry a removal-regex list
    /// (`versions::version_regex_cache_key`). Only system prompts do: it is a
    /// signals artifact, generated on demand by `static_sp_extraction::worker`.
    pub fn has_removal_regexes(self) -> bool {
        matches!(self, VersionKind::SystemPrompt)
    }

    pub fn keys(self) -> &'static KeyPrefixes {
        match self {
            VersionKind::SystemPrompt => &SYSTEM_PROMPT_KEYS,
            VersionKind::UserTemplate => &USER_TEMPLATE_KEYS,
        }
    }

    pub fn tunables(self) -> &'static Tunables {
        match self {
            VersionKind::SystemPrompt => &SYSTEM_PROMPT_TUNABLES,
            VersionKind::UserTemplate => &USER_TEMPLATE_TUNABLES,
        }
    }

    pub fn queues(self) -> &'static Queues {
        match self {
            VersionKind::SystemPrompt => &SYSTEM_PROMPT_QUEUES,
            VersionKind::UserTemplate => &USER_TEMPLATE_QUEUES,
        }
    }

    pub fn tables(self) -> &'static Tables {
        match self {
            VersionKind::SystemPrompt => &SYSTEM_PROMPT_TABLES,
            VersionKind::UserTemplate => &USER_TEMPLATE_TABLES,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    fn key_prefixes(kind: VersionKind) -> [&'static str; 7] {
        let keys = kind.keys();
        [
            keys.registry,
            keys.version_lines,
            keys.window,
            keys.window_lines,
            keys.memo,
            keys.mint_lock,
            keys.probe,
        ]
    }

    #[test]
    fn kinds_share_no_redis_key_prefix() {
        let mut seen = HashSet::new();
        for kind in VersionKind::ALL {
            for prefix in key_prefixes(kind) {
                assert!(seen.insert(prefix), "{prefix} is used twice");
            }
        }
    }

    #[test]
    fn only_user_templates_split_by_turn() {
        let sp = VersionKind::SystemPrompt;
        assert_eq!(sp.partition("agent01", false), "agent01");
        assert_eq!(sp.partition("agent01", true), "agent01");

        let ut = VersionKind::UserTemplate;
        assert_ne!(
            ut.partition("agent01", false),
            ut.partition("agent01", true)
        );
        assert_ne!(
            ut.partition("agent01", false),
            ut.partition("agent02", false)
        );
    }

    #[test]
    fn kinds_share_no_queue_or_table() {
        let mut seen = HashSet::new();
        for kind in VersionKind::ALL {
            let queues = kind.queues();
            let tables = kind.tables();
            for name in [
                queues.queue,
                queues.exchange,
                queues.delay_queue,
                queues.delay_exchange,
                tables.versions,
                tables.defs,
            ] {
                assert!(seen.insert(name), "{name} is used twice");
            }
        }
    }
}
