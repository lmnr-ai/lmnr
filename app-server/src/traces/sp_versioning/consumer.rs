//! Consumer for the sp-versioning queue: LLM-free version classification.
//!
//! Classifies each prompt against the agent's live version registry (cheap
//! subset match), maintains the per-agent prompt window, mints new versions
//! (top-K Jaccard cluster → ordered LCS intersection) when the static part
//! changed, and writes one `system_prompt_versions` row per span of the
//! message being processed. Minting registers the version (registry + line
//! set) and nothing else — regexes are generated on demand when a consumer
//! first needs them (see `static_sp_extraction::worker`). No LLM runs here,
//! so the mint lock is held for milliseconds.
//!
//! A message that can't resolve yet (cold-start window, mint in progress,
//! transient error) parks on the delay queue and re-checks on redelivery, up
//! to `SP_EXTRACTION_MAX_RETRIES` times; on the final delivery a cold-start
//! message mints best-effort from whatever the window holds instead of
//! dropping.

use std::sync::{Arc, LazyLock};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    SP_VERSIONING_DELAY_EXCHANGE, SP_VERSIONING_DELAY_ROUTING_KEY, similarity, versions,
    window::{self, WindowEntry},
};
use crate::{
    cache::{Cache, CacheTrait},
    ch::system_prompt_versions::{
        CHSystemPromptVersion, CHSystemPromptVersionDef, insert_system_prompt_version_def,
        insert_system_prompt_versions,
    },
    env,
    mq::{MessageQueue, MessageQueueTrait},
    worker::{HandlerError, MessageHandler},
};

use super::window::SpanRef;

/// Fallback trigger shared with the legacy accumulator: total occurrences
/// after which an unlabeled prompt is resolved even though the window never
/// diversified (a byte-identical prompt never grows the window).
static OCCURRENCE_THRESHOLD: LazyLock<u64> =
    LazyLock::new(|| env::static_sp::OCCURRENCE_THRESHOLD.get());

static WINDOW_SIZE: LazyLock<usize> = LazyLock::new(|| env::static_sp::WINDOW_SIZE.get());
static WINDOW_MAX_AGE_SECONDS: LazyLock<i64> =
    LazyLock::new(|| env::static_sp::WINDOW_MAX_AGE_SECONDS.get());
static MIN_WINDOW: LazyLock<usize> = LazyLock::new(|| env::static_sp::MIN_WINDOW.get());
static WINDOW_MIN_ENTRIES: LazyLock<usize> =
    LazyLock::new(|| env::static_sp::WINDOW_MIN_ENTRIES.get());
static TOP_K_PERCENT: LazyLock<usize> = LazyLock::new(|| env::static_sp::TOP_K_PERCENT.get());

static WINDOW_TTL_SECONDS: LazyLock<u64> =
    LazyLock::new(|| env::static_sp::WINDOW_TTL_SECONDS.get());
static RETRY_DELAY_MS: LazyLock<u64> = LazyLock::new(|| env::static_sp::RETRY_DELAY_MS.get());
static MAX_RETRIES: LazyLock<u32> = LazyLock::new(|| env::static_sp::MAX_RETRIES.get());

/// Cluster size for a window of `available` usable entries.
///
/// The percentage only applies to a window that reached `MIN_WINDOW`. Below
/// it we are already minting best-effort and there is nothing to discard — the
/// window is small because data is scarce, not because it holds outliers — and
/// a 50% slice of three prompts is ONE prompt, whose "intersection" is that
/// prompt verbatim, dynamic lines and all. Such a version matches only the
/// prompt that minted it, so it is guaranteed churn.
fn cluster_size(available: usize, min_window: usize) -> usize {
    if available < min_window {
        return available.max(1);
    }
    (available * *TOP_K_PERCENT / 100).max(1)
}

/// TTL on the per-agent mint lock. The critical section is a registry RMW
/// (no LLM), so this only needs to cover Redis hiccups.
const MINT_LOCK_TTL_SECONDS: u64 = 60;

/// Which rule allowed a mint — recorded on the journal row because it is the
/// signal that separates the two churn failure modes: a `Forced*` mint
/// intersects a PARTIAL window and is expected to be weak, while `Normal`
/// mints churning repeatedly mean top-K isn't rejecting dynamic content.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MintGate {
    /// Window held at least `MIN_WINDOW` usable distinct prompts.
    Normal,
    /// Occurrence-threshold fallback: a byte-identical prompt never
    /// diversified the window.
    ForcedOccurrence,
    /// Retry budget exhausted — best-effort intersection over a partial
    /// window.
    ForcedRetryBudget,
}

impl MintGate {
    fn as_str(self) -> &'static str {
        match self {
            MintGate::Normal => "normal",
            MintGate::ForcedOccurrence => "forced_occurrence",
            MintGate::ForcedRetryBudget => "forced_retry_budget",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpVersioningMessage {
    pub project_id: Uuid,
    /// Raw prompt body. Empty on slim messages (version already known and no
    /// mint possible). Only the full algorithm needs it — for the window it is
    /// `line_hashes` that matters.
    pub system_prompt: String,
    /// First-sentence hash — the agent identity.
    pub agent_hash: String,
    /// 128-bit content hash of the raw prompt.
    pub full_prompt_hash: String,
    /// Per-line hashes of the prompt, computed by the producer for its inline
    /// cheap match. Rides every message so a slim one (no body) still appends
    /// to the window — without it, every new prompt that cheap-matches an
    /// existing version would be invisible to the window and no future version
    /// could ever be minted. Empty on legacy messages, where it is recomputed
    /// from the body.
    #[serde(default)]
    pub line_hashes: Vec<u64>,
    /// Spans that presented this prompt — each gets a version row.
    pub span_refs: Vec<SpanRef>,
    /// Set when the producer's byte-identity MEMO resolved this prompt. Already
    /// memoized, so the consumer must not re-write it: `memo_set` resets the
    /// TTL, and refreshing it on every hit would pin a high-volume prompt to
    /// its first-matched version forever instead of re-classifying hourly.
    #[serde(default)]
    pub known_version_hash: Option<String>,
    /// Set when the producer's inline subset match resolved this prompt against
    /// the live registry. Distinct from `known_version_hash` because this
    /// verdict is NOT memoized yet and the prompt is a new distinct body, so the
    /// consumer both writes the memo and appends to the window.
    #[serde(default)]
    pub cheap_matched_version: Option<String>,
    /// The producer's per-agent staleness interval elapsed, so this message re-runs the
    /// full algorithm even though the cheap match hit. Only ever set alongside a
    /// body, so it can't ask for a mint the message can't journal.
    #[serde(default)]
    pub run_full: bool,
    /// Times this message was parked on the delay queue. Bounded by
    /// `SP_EXTRACTION_MAX_RETRIES`; parked redeliveries don't bump the
    /// window's `seen_count`.
    #[serde(default)]
    pub retry_count: u32,
}

impl SpVersioningMessage {
    /// Line hashes as shipped, or recomputed from the body for legacy messages
    /// published before the producer started sending them.
    fn line_hashes(&self) -> Vec<u64> {
        if self.line_hashes.is_empty() {
            similarity::line_hashes(&self.system_prompt)
        } else {
            self.line_hashes.clone()
        }
    }
}

pub struct SpVersioningHandler {
    pub cache: Arc<Cache>,
    pub clickhouse: clickhouse::Client,
    /// For parking unresolved messages on the delay queue.
    pub queue: Arc<MessageQueue>,
}

impl SpVersioningHandler {
    pub fn new(
        cache: Arc<Cache>,
        clickhouse: clickhouse::Client,
        queue: Arc<MessageQueue>,
    ) -> Self {
        Self {
            cache,
            clickhouse,
            queue,
        }
    }
}

#[async_trait]
impl MessageHandler for SpVersioningHandler {
    type Message = Vec<SpVersioningMessage>;

    // Classification is LLM-free, so it runs unconditionally: the ingest
    // producer gates publishing on `llm_client_available()`, and the
    // extraction workers (which DO need the client) consume their own queue
    // — possibly on another node.
    async fn handle(&self, messages: Self::Message) -> Result<(), HandlerError> {
        let mut rows: Vec<CHSystemPromptVersion> = Vec::new();
        for message in &messages {
            let rows_before = rows.len();
            if let Err(e) = self.process_message(message, &mut rows).await {
                log::error!(
                    "[SP_VERSIONING] Failed to process prompt for agent {}: {e:?}",
                    message.agent_hash
                );
                // Errors are transient (Redis) — park and re-check, but only
                // when the message produced no rows: a failure AFTER rows
                // were queued (e.g. window save) would double-write them on
                // redelivery.
                if rows.len() == rows_before {
                    self.park(message, "processing error").await;
                }
            }
        }

        // Best-effort: a failed insert leaves the spans unlabeled, so once
        // their memo entry expires the summarizer can't resolve their version
        // and renders the raw prompt. Requeueing would double-write rows for
        // the messages that already succeeded.
        if !rows.is_empty()
            && let Err(e) = insert_system_prompt_versions(&self.clickhouse, &rows).await
        {
            log::error!(
                "[SP_VERSIONING] Failed to insert {} system_prompt_versions rows: {e:?}",
                rows.len()
            );
        }
        Ok(())
    }
}

/// Version rows for every span of a resolved message.
fn push_message_rows(
    message: &SpVersioningMessage,
    version_hash: &str,
    rows_out: &mut Vec<CHSystemPromptVersion>,
) {
    for span_ref in &message.span_refs {
        rows_out.push(CHSystemPromptVersion::new(
            message.project_id,
            span_ref.trace_id,
            span_ref.span_id,
            &message.agent_hash,
            version_hash,
        ));
    }
}

impl SpVersioningHandler {
    /// Park the message on the delay queue; the broker dead-letters it back
    /// into the main exchange after `SP_EXTRACTION_RETRY_DELAY_MS` for a
    /// re-check. Past the retry cap — or when the publish fails (e.g. the
    /// in-memory queue has no TTL/dead-lettering) — the message drops and its
    /// spans stay unlabeled, so the summarizer renders their raw prompt once
    /// the memo entry expires.
    async fn park(&self, message: &SpVersioningMessage, reason: &str) {
        if message.retry_count >= *MAX_RETRIES {
            log::warn!(
                "[SP_VERSIONING] Dropping message for agent {} after {} parks ({reason}); {} span(s) stay unlabeled",
                message.agent_hash,
                message.retry_count,
                message.span_refs.len()
            );
            return;
        }

        let mut parked = message.clone();
        parked.retry_count += 1;
        let payload = match serde_json::to_vec(&vec![parked]) {
            Ok(payload) => payload,
            Err(e) => {
                log::error!("[SP_VERSIONING] Failed to serialize parked message: {e:?}");
                return;
            }
        };
        if let Err(e) = self
            .queue
            .publish(
                &payload,
                SP_VERSIONING_DELAY_EXCHANGE,
                SP_VERSIONING_DELAY_ROUTING_KEY,
                Some(*RETRY_DELAY_MS),
            )
            .await
        {
            log::warn!(
                "[SP_VERSIONING] Failed to park message for agent {} ({reason}); dropping: {e:?}",
                message.agent_hash
            );
        }
    }

    async fn process_message(
        &self,
        message: &SpVersioningMessage,
        rows_out: &mut Vec<CHSystemPromptVersion>,
    ) -> anyhow::Result<()> {
        // Memo-resolved by the producer: the prompt is byte-identical to a
        // window entry that already exists and is already labeled, so there is
        // nothing to append and no memo to (re-)write.
        if let Some(version_hash) = &message.known_version_hash {
            push_message_rows(message, version_hash, rows_out);
            return Ok(());
        }

        // The memo may have been filled while this message sat in the queue —
        // this is also how parked messages resolve after a mint completes.
        if let Some(version_hash) =
            versions::memo_get(&self.cache, message.project_id, &message.full_prompt_hash).await
        {
            push_message_rows(message, &version_hash, rows_out);
            return Ok(());
        }

        let line_hashes = message.line_hashes();
        if line_hashes.is_empty() || message.span_refs.is_empty() {
            return Ok(());
        }
        let lines_set = similarity::line_hash_set(&line_hashes);

        let window_key = window::window_cache_key(message.project_id, &message.agent_hash);
        let mut win = window::load_window(&self.cache, &window_key).await?;
        let upsert = window::upsert_entry(
            &mut win,
            &message.full_prompt_hash,
            message.span_refs.first().copied(),
            *WINDOW_SIZE,
            *WINDOW_MAX_AGE_SECONDS,
            *WINDOW_MIN_ENTRIES,
            message.retry_count == 0,
        );

        // Line hashes ride their own key. Write before the window blob that
        // references them; refresh in place otherwise, so a recurring prompt's
        // hashes expire no sooner than its entry.
        if upsert.inserted {
            window::save_entry_lines(
                &self.cache,
                message.project_id,
                &message.agent_hash,
                &message.full_prompt_hash,
                &line_hashes,
                *WINDOW_TTL_SECONDS,
            )
            .await?;
        } else {
            window::touch_entry_lines(
                &self.cache,
                message.project_id,
                &message.agent_hash,
                &message.full_prompt_hash,
                *WINDOW_TTL_SECONDS,
            )
            .await;
        }

        let result = self
            .classify(
                message,
                &mut win,
                upsert.idx,
                &line_hashes,
                &lines_set,
                rows_out,
            )
            .await;

        // Persist window state (appends, seen counts, labels) even when
        // classification failed — the entry itself is valid history.
        window::save_window(&self.cache, &window_key, &win, *WINDOW_TTL_SECONDS).await?;
        // Only once the blob no longer references them.
        window::remove_entry_lines(
            &self.cache,
            message.project_id,
            &message.agent_hash,
            &upsert.evicted,
        )
        .await;
        result
    }

    async fn classify(
        &self,
        message: &SpVersioningMessage,
        win: &mut Vec<WindowEntry>,
        entry_idx: usize,
        line_hashes: &[u64],
        lines_set: &std::collections::HashSet<u64>,
        rows_out: &mut Vec<CHSystemPromptVersion>,
    ) -> anyhow::Result<()> {
        // The producer already ran the subset match inline (it needs the verdict
        // to key the user-task regex), so re-running it here would duplicate
        // 11 Redis reads for the same answer. A parked redelivery carries no
        // verdict and falls through to the local match.
        let matched = match &message.cheap_matched_version {
            Some(version_hash) => Some(version_hash.clone()),
            None => {
                versions::cheap_match(
                    &self.cache,
                    message.project_id,
                    &message.agent_hash,
                    lines_set,
                )
                .await?
            }
        };

        match matched {
            Some(version_hash) => {
                push_message_rows(message, &version_hash, rows_out);
                win[entry_idx].labeled = true;
                versions::memo_set(
                    &self.cache,
                    message.project_id,
                    &message.full_prompt_hash,
                    &version_hash,
                )
                .await;
                // Staleness probe: a hit can be an OLD version whose static
                // set still subset-matches after an addition, so the producer's
                // per-agent interval sends some hits back through the full algorithm,
                // which mints if the intersection hash moved. The body check is
                // defence in depth — the producer only sets the flag alongside
                // one, and `journal_mint` needs it to reconstruct static text.
                if message.run_full && !message.system_prompt.is_empty() {
                    self.full_algorithm(
                        message,
                        win,
                        entry_idx,
                        line_hashes,
                        Some(&version_hash),
                        rows_out,
                    )
                    .await?;
                }
                Ok(())
            }
            None => {
                self.full_algorithm(message, win, entry_idx, line_hashes, None, rows_out)
                    .await
            }
        }
    }

    /// Top-N% clustering → ordered LCS intersection → mint-if-new. Called on
    /// cheap-match misses (always) and sampled hits (staleness probe).
    ///
    /// `probe_of` carries the version the cheap match resolved to, and is
    /// `Some` exactly on the probe path — see the mint gate below.
    #[allow(clippy::too_many_arguments)]
    async fn full_algorithm(
        &self,
        message: &SpVersioningMessage,
        win: &mut Vec<WindowEntry>,
        entry_idx: usize,
        line_hashes: &[u64],
        probe_of: Option<&str>,
        rows_out: &mut Vec<CHSystemPromptVersion>,
    ) -> anyhow::Result<()> {
        let min_window = (*MIN_WINDOW).max(1);
        // The only path that needs every entry's hashes, which is why they sit
        // outside the window blob. Entries whose key is gone can't cluster, so
        // the gates below count what is actually usable, not `win.len()` —
        // otherwise a thinned window would silently mint from fewer prompts
        // than required while still reporting the `Normal` gate.
        let lines = window::load_window_lines(
            &self.cache,
            message.project_id,
            &message.agent_hash,
            win,
            entry_idx,
            line_hashes,
        )
        .await;
        let available = lines.iter().filter(|l| l.is_some()).count();
        // Fully-static fallback: an unlabeled prompt seen this many times is
        // resolved regardless of window population (a byte-identical prompt
        // never diversifies the window).
        let fully_static = win[entry_idx].seen_count >= *OCCURRENCE_THRESHOLD;
        // Final delivery: the retry budget bought the window time to fill; a
        // best-effort mint from a partial window beats dropping the message.
        // Weaker intersections self-heal — once the window grows, a cheap-match
        // miss or staleness probe re-runs the full algorithm and mints the
        // corrected hash.
        let last_attempt = message.retry_count >= *MAX_RETRIES;
        let force = !win[entry_idx].labeled && (fully_static || last_attempt);
        // Cold-start gate: minting from a partial window churns the hash on
        // every arrival (intersection-of-2 ≠ of-3 ≠ … of-K), each churn an
        // agent run. Park so the spans get their rows once the window fills.
        if available < min_window && !force {
            if !win[entry_idx].labeled {
                self.park(message, "cold-start window").await;
            }
            return Ok(());
        }
        let gate = if available >= min_window {
            MintGate::Normal
        } else if fully_static {
            MintGate::ForcedOccurrence
        } else {
            MintGate::ForcedRetryBudget
        };
        if last_attempt && available < min_window {
            log::info!(
                "[SP_VERSIONING] Retry budget exhausted for agent {} (project {}) — minting from partial window of {}",
                message.agent_hash,
                message.project_id,
                available
            );
        }

        let selected =
            window::select_top_k(win, &lines, entry_idx, cluster_size(available, min_window));
        // Deterministic LCS fold order, independent of similarity ranking.
        let mut ordered = selected.clone();
        ordered.sort_by(|a, b| {
            (win[*a].added_at, &win[*a].full_prompt_hash)
                .cmp(&(win[*b].added_at, &win[*b].full_prompt_hash))
        });
        let seqs: Vec<&[u64]> = ordered
            .iter()
            .filter_map(|i| lines[*i].as_deref())
            .collect();
        let intersection = similarity::intersect_ordered(&seqs);
        if intersection.is_empty() {
            log::warn!(
                "[SP_VERSIONING] Empty intersection for agent {} (project {}, {} candidates) — skipping mint",
                message.agent_hash,
                message.project_id,
                selected.len()
            );
            if !win[entry_idx].labeled {
                self.park(message, "empty intersection").await;
            }
            return Ok(());
        }
        // Staleness-probe mint gate. On this path `cheap_match` already proved
        // the matched version's static set is contained in THIS prompt, so the
        // version still describes it correctly and the span is already labeled.
        // An intersection that isn't a strict superset is therefore not
        // evidence about the prompt — it is the intersection estimator
        // disagreeing with itself across two samples of the window, and
        // minting on it forks the version on resampling noise (measured: the
        // dominant source of version churn, since the probe re-runs the
        // estimator ~100x more often than cheap-match misses do).
        //
        // Nothing is lost, because the probe's job is ADDITIONS: a genuine
        // removal breaks the subset match by construction and arrives through
        // the cheap-match miss path below, attributed to the prompts that
        // actually changed. A lapsed line-set key also skips the mint — the
        // premise is then unverifiable, and it self-heals since `cheap_match`
        // skips that version from now on, so the next prompt takes the miss
        // path.
        if let Some(matched) = probe_of {
            let grew = match versions::load_version_lines(
                &self.cache,
                message.project_id,
                &message.agent_hash,
                matched,
            )
            .await
            {
                Some(matched_lines) => {
                    similarity::is_strict_superset(&intersection, &matched_lines)
                }
                None => false,
            };
            if !grew {
                return Ok(());
            }
        }

        let version_hash = similarity::version_hash(&intersection);

        // Known version — reachable when the version's line-set key lapsed
        // (subset match skipped it) or a concurrent worker minted it between
        // our cheap match and here.
        let registry =
            versions::load_registry(&self.cache, message.project_id, &message.agent_hash).await?;
        if registry.iter().any(|v| v.version_hash == version_hash) {
            self.resolve_message(message, win, entry_idx, &version_hash, rows_out)
                .await;
            return Ok(());
        }

        // One mint per agent: whoever holds the lock registers; everyone
        // else parks and re-checks once the mint has finished.
        let lock_key = versions::mint_lock_cache_key(message.project_id, &message.agent_hash);
        let acquired = self
            .cache
            .try_acquire_lock(&lock_key, MINT_LOCK_TTL_SECONDS)
            .await
            .unwrap_or_else(|e| {
                log::warn!("[SP_VERSIONING] Failed to acquire lock {lock_key}: {e:?}");
                false
            });
        if !acquired {
            if !win[entry_idx].labeled {
                self.park(message, "mint in progress").await;
            }
            return Ok(());
        }

        let result = self
            .mint_version(
                message,
                win,
                entry_idx,
                &selected,
                &intersection,
                &version_hash,
                gate,
                rows_out,
            )
            .await;

        if let Err(e) = self.cache.release_lock(&lock_key).await {
            log::warn!("[SP_VERSIONING] Failed to release lock {lock_key}: {e:?}");
        }
        result
    }

    /// Runs with the mint lock held; the caller releases it on every path.
    #[allow(clippy::too_many_arguments)]
    async fn mint_version(
        &self,
        message: &SpVersioningMessage,
        win: &mut Vec<WindowEntry>,
        entry_idx: usize,
        selected: &[usize],
        intersection: &[u64],
        version_hash: &str,
        gate: MintGate,
        rows_out: &mut Vec<CHSystemPromptVersion>,
    ) -> anyhow::Result<()> {
        // Double-check under the lock: a concurrent worker may have minted
        // this hash between our registry read and the acquisition.
        let registry =
            versions::load_registry(&self.cache, message.project_id, &message.agent_hash).await?;
        if registry.iter().any(|v| v.version_hash == version_hash) {
            self.resolve_message(message, win, entry_idx, version_hash, rows_out)
                .await;
            return Ok(());
        }

        // Single distinct sample (occurrence-threshold fallback or an
        // exhausted retry budget): nothing to diff, nothing to strip — the
        // empty regex list IS the verdict, written atomically with the
        // registration. Multi-sample versions register with NO regex key:
        // generation is demand-driven (the first consumer that needs the
        // regexes and finds the key absent publishes an extraction request —
        // see `static_sp_extraction::worker`).
        let regexes: Option<&[_]> = if selected.len() == 1 {
            log::debug!(
                "[SP_VERSIONING] Single-sample mint for agent {} — registering {} with empty regex list",
                message.agent_hash,
                version_hash
            );
            Some(&[])
        } else {
            None
        };
        versions::register_version(
            &self.cache,
            message.project_id,
            &message.agent_hash,
            version_hash,
            intersection,
            regexes,
        )
        .await?;

        log::info!(
            "[SP_VERSIONING] Minted version {} for agent {} (project {}, {} static lines, {} cluster samples, gate {})",
            version_hash,
            message.agent_hash,
            message.project_id,
            intersection.len(),
            selected.len(),
            gate.as_str()
        );

        self.journal_mint(
            message,
            selected,
            intersection,
            version_hash,
            gate,
            win.len(),
        )
        .await;

        // Rows for this message's spans only — spans of other cluster entries
        // are parked and resolve via memo / cheap match on redelivery.
        self.resolve_message(message, win, entry_idx, version_hash, rows_out)
            .await;
        Ok(())
    }

    /// Record the mint in `system_prompt_version_defs`. Best-effort and
    /// off the read path: nothing in the pipeline consumes this table, so a
    /// failed insert costs analysis fidelity only. The static TEXT is
    /// reconstructed here because the registry stores one-way line hashes —
    /// this is the only durable record of what a version actually contains.
    async fn journal_mint(
        &self,
        message: &SpVersioningMessage,
        selected: &[usize],
        intersection: &[u64],
        version_hash: &str,
        gate: MintGate,
        window_len: usize,
    ) {
        let example = message.span_refs.first();
        let row = CHSystemPromptVersionDef::new(
            message.project_id,
            &message.agent_hash,
            version_hash,
            &similarity::reconstruct_static_text(&message.system_prompt, intersection),
            intersection.len(),
            selected.len(),
            window_len,
            gate.as_str(),
            example.map(|r| r.trace_id).unwrap_or_default(),
            example.map(|r| r.span_id).unwrap_or_default(),
        );
        if let Err(e) = insert_system_prompt_version_def(&self.clickhouse, &row).await {
            log::warn!(
                "[SP_VERSIONING] Failed to journal version {version_hash} for agent {}: {e:?}",
                message.agent_hash
            );
        }
    }

    /// Rows + memo for a message whose version is (now) registered. Gated on
    /// the entry's `labeled` flag: on the sampled-probe path the cheap match
    /// already wrote this message's rows, and re-pushing would double-write.
    async fn resolve_message(
        &self,
        message: &SpVersioningMessage,
        win: &mut Vec<WindowEntry>,
        entry_idx: usize,
        version_hash: &str,
        rows_out: &mut Vec<CHSystemPromptVersion>,
    ) {
        if !win[entry_idx].labeled {
            push_message_rows(message, version_hash, rows_out);
            win[entry_idx].labeled = true;
            versions::memo_set(
                &self.cache,
                message.project_id,
                &message.full_prompt_hash,
                version_hash,
            )
            .await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;
    use crate::mq::{
        MessageQueueDeliveryTrait, MessageQueueReceiver, MessageQueueReceiverTrait,
        tokio_mpsc::TokioMpscQueue,
    };
    use crate::traces::sp_versioning::SP_VERSIONING_DELAY_QUEUE;

    const AGENT: &str = "agent001";

    fn make_handler() -> SpVersioningHandler {
        SpVersioningHandler {
            cache: Arc::new(Cache::InMemory(InMemoryCache::new(None))),
            clickhouse: clickhouse::Client::default(),
            queue: Arc::new(MessageQueue::TokioMpsc(TokioMpscQueue::new())),
        }
    }

    /// Attach a receiver to the delay queue so parks are observable — the
    /// in-memory queue errors on publish without one (park then degrades to
    /// drop, which is also the production posture without RabbitMQ).
    async fn delay_receiver(handler: &SpVersioningHandler) -> MessageQueueReceiver {
        handler
            .queue
            .get_receiver(
                SP_VERSIONING_DELAY_QUEUE,
                SP_VERSIONING_DELAY_EXCHANGE,
                SP_VERSIONING_DELAY_ROUTING_KEY,
                1,
            )
            .await
            .unwrap()
    }

    /// Drain everything currently parked on the delay queue.
    async fn drain_parked(receiver: &mut MessageQueueReceiver) -> Vec<SpVersioningMessage> {
        let mut parked = Vec::new();
        while let Ok(Some(Ok(delivery))) =
            tokio::time::timeout(std::time::Duration::from_millis(20), receiver.receive()).await
        {
            let batch: Vec<SpVersioningMessage> = serde_json::from_slice(&delivery.data()).unwrap();
            parked.extend(batch);
        }
        parked
    }

    fn make_message(project_id: Uuid, prompt: &str) -> SpVersioningMessage {
        SpVersioningMessage {
            project_id,
            system_prompt: prompt.to_string(),
            agent_hash: AGENT.to_string(),
            full_prompt_hash: similarity::full_prompt_hash(prompt),
            line_hashes: similarity::line_hashes(prompt),
            span_refs: vec![SpanRef {
                trace_id: Uuid::new_v4(),
                span_id: Uuid::new_v4(),
            }],
            known_version_hash: None,
            cheap_matched_version: None,
            run_full: false,
            retry_count: 0,
        }
    }

    fn versioned_prompt(i: usize) -> String {
        format!("You are a test agent.\nuser: user-{i}\nbody line\ntail line")
    }

    /// Feed K distinct same-version prompts; the K-th mints and gets its row
    /// (earlier ones park — dropped here since no delay receiver is attached).
    /// Returns the rows written and the minted version hash.
    async fn mint_first_version(
        handler: &SpVersioningHandler,
        project_id: Uuid,
    ) -> (Vec<CHSystemPromptVersion>, String) {
        let mut rows = Vec::new();
        for i in 0..*MIN_WINDOW {
            let message = make_message(project_id, &versioned_prompt(i));
            handler.process_message(&message, &mut rows).await.unwrap();
        }
        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        assert_eq!(registry.len(), 1, "exactly one version minted");
        (rows, registry[0].version_hash.clone())
    }

    #[test]
    fn cluster_is_the_configured_share_of_a_healthy_window() {
        assert_eq!(cluster_size(200, 20), 200 * *TOP_K_PERCENT / 100);
    }

    #[test]
    fn cluster_is_the_whole_partial_window() {
        // Half of three is one, and a one-prompt cluster intersects to that
        // prompt verbatim — a version that can only ever match its own mint.
        assert_eq!(cluster_size(3, 20), 3);
        assert_eq!(cluster_size(19, 20), 19);
    }

    #[test]
    fn cluster_is_never_empty() {
        assert_eq!(cluster_size(0, 20), 1);
        assert_eq!(cluster_size(1, 1), 1);
    }

    #[tokio::test]
    async fn cold_start_parks_messages_below_top_k() {
        let handler = make_handler();
        let mut receiver = delay_receiver(&handler).await;
        let project_id = Uuid::new_v4();
        let mut rows = Vec::new();

        for i in 0..*MIN_WINDOW - 1 {
            handler
                .process_message(&make_message(project_id, &versioned_prompt(i)), &mut rows)
                .await
                .unwrap();
        }

        assert!(rows.is_empty(), "no version rows before a mint");
        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        assert!(registry.is_empty(), "no version minted below MIN_WINDOW");
        let win = window::load_window(&handler.cache, &window::window_cache_key(project_id, AGENT))
            .await
            .unwrap();
        assert_eq!(win.len(), *MIN_WINDOW - 1, "window still accumulates");

        // Every cold-start message parked for a delayed re-check.
        let parked = drain_parked(&mut receiver).await;
        assert_eq!(parked.len(), *MIN_WINDOW - 1);
        assert!(parked.iter().all(|m| m.retry_count == 1));
        assert!(
            parked.iter().all(|m| !m.system_prompt.is_empty()),
            "parked messages keep their body for re-classification"
        );
    }

    #[tokio::test]
    async fn mint_registers_and_parked_spans_resolve_on_redelivery() {
        let handler = make_handler();
        let mut receiver = delay_receiver(&handler).await;
        let project_id = Uuid::new_v4();
        let (rows, version_hash) = mint_first_version(&handler, project_id).await;

        // Only the minting message's span got a row so far.
        assert_eq!(rows.len(), 1, "mint labels the triggering message only");
        assert_eq!(rows[0].static_prompt_version_hash, version_hash);

        // The static intersection excludes the dynamic user line.
        let lines_key = versions::version_lines_cache_key(project_id, AGENT, &version_hash);
        let static_lines = handler
            .cache
            .get::<Vec<u64>>(&lines_key)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            static_lines,
            similarity::line_hashes("You are a test agent.\nbody line\ntail line")
        );

        // Regexes stay ABSENT after a multi-sample mint: generation is
        // demand-driven — the first consumer that needs them publishes an
        // extraction request.
        assert!(
            versions::get_version_regexes(&handler.cache, project_id, AGENT, &version_hash)
                .await
                .is_none()
        );

        // Redeliver the parked cold-start messages: each now cheap-matches
        // the minted version and gets its rows.
        let parked = drain_parked(&mut receiver).await;
        assert_eq!(parked.len(), *MIN_WINDOW - 1);
        let mut redelivered_rows = Vec::new();
        for message in &parked {
            handler
                .process_message(message, &mut redelivered_rows)
                .await
                .unwrap();
        }
        assert_eq!(redelivered_rows.len(), *MIN_WINDOW - 1);
        assert!(
            redelivered_rows
                .iter()
                .all(|r| r.static_prompt_version_hash == version_hash)
        );
        // Nothing re-parked, no second mint.
        assert!(drain_parked(&mut receiver).await.is_empty());
        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        assert_eq!(registry.len(), 1);
    }

    #[tokio::test]
    async fn cheap_match_labels_without_new_mint() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let (_, version_hash) = mint_first_version(&handler, project_id).await;

        // A new same-version prompt: cheap match resolves, no new mint.
        let message = make_message(project_id, &versioned_prompt(999));
        let mut rows = Vec::new();
        handler.process_message(&message, &mut rows).await.unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].static_prompt_version_hash, version_hash);
        assert_eq!(rows[0].span_id, message.span_refs[0].span_id);
        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        assert_eq!(registry.len(), 1, "no second mint");

        // Memo now short-circuits byte-identical repeats.
        let memo = versions::memo_get(&handler.cache, project_id, &message.full_prompt_hash).await;
        assert_eq!(memo.as_deref(), Some(version_hash.as_str()));
    }

    /// Drive `full_algorithm` against a window whose prompts have all dropped
    /// `tail line`, so the fold can only keep the header and body — a strict
    /// SHRINK of the matched version. Returns the live version count.
    ///
    /// The probe prompt itself still carries `tail line`, which is the whole
    /// point: `cheap_match` matched it legitimately, and the smaller
    /// intersection is the estimator's view of the rest of the window, not
    /// evidence about this prompt.
    async fn probe_against_shrinking_window(gated: bool) -> usize {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let (_, version_hash) = mint_first_version(&handler, project_id).await;

        let add = |win: &mut Vec<WindowEntry>, hash: &str| {
            window::upsert_entry(
                win,
                hash,
                None,
                *WINDOW_SIZE,
                *WINDOW_MAX_AGE_SECONDS,
                *WINDOW_MIN_ENTRIES,
                true,
            )
        };
        let mut win = Vec::new();
        for i in 0..*MIN_WINDOW {
            let sibling = format!("You are a test agent.\nuser: other-{i}\nbody line");
            let hash = similarity::full_prompt_hash(&sibling);
            window::save_entry_lines(
                &handler.cache,
                project_id,
                AGENT,
                &hash,
                &similarity::line_hashes(&sibling),
                3600,
            )
            .await
            .unwrap();
            add(&mut win, &hash);
        }
        let probe = make_message(project_id, &versioned_prompt(4242));
        window::save_entry_lines(
            &handler.cache,
            project_id,
            AGENT,
            &probe.full_prompt_hash,
            &probe.line_hashes,
            3600,
        )
        .await
        .unwrap();
        let idx = add(&mut win, &probe.full_prompt_hash).idx;

        let mut rows = Vec::new();
        handler
            .full_algorithm(
                &probe,
                &mut win,
                idx,
                &probe.line_hashes,
                gated.then_some(version_hash.as_str()),
                &mut rows,
            )
            .await
            .unwrap();
        versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap()
            .len()
    }

    /// The churn engine: a re-run that merely resamples the window forks the
    /// version even though the matched one still describes the prompt. This is
    /// the correct behaviour on the MISS path — a prompt that no longer
    /// contains the version needs a new one.
    #[tokio::test]
    async fn miss_path_mints_on_a_shrunken_intersection() {
        assert_eq!(probe_against_shrinking_window(false).await, 2);
    }

    #[tokio::test]
    async fn probe_does_not_mint_on_a_shrunken_intersection() {
        assert_eq!(probe_against_shrinking_window(true).await, 1);
    }

    /// The probe's actual job — a genuine ADDITION still mints through it.
    #[tokio::test]
    async fn probe_mints_on_a_genuine_addition() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let (_, version_hash) = mint_first_version(&handler, project_id).await;

        // A second generation of prompts: same static core plus a new line.
        // Each contains the old version, so every one cheap-matches it and
        // only the probe can notice the addition.
        let grown = |i: usize| format!("{}\nbrand new line", versioned_prompt(1000 + i));
        for i in 0..*MIN_WINDOW {
            let mut message = make_message(project_id, &grown(i));
            message.cheap_matched_version = Some(version_hash.clone());
            let mut rows = Vec::new();
            handler.process_message(&message, &mut rows).await.unwrap();
        }
        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        assert_eq!(registry.len(), 1, "cheap-match hits alone never mint");

        let mut message = make_message(project_id, &grown(9999));
        message.cheap_matched_version = Some(version_hash.clone());
        message.run_full = true;
        let mut rows = Vec::new();
        handler.process_message(&message, &mut rows).await.unwrap();

        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        assert_eq!(registry.len(), 2, "the addition minted a new version");
        // Newest first (`register_version` inserts at 0), so select by hash
        // rather than position.
        let minted = registry
            .iter()
            .find(|v| v.version_hash != version_hash)
            .expect("a version other than the matched one");
        let grown_lines =
            versions::load_version_lines(&handler.cache, project_id, AGENT, &minted.version_hash)
                .await
                .unwrap();
        let old_lines =
            versions::load_version_lines(&handler.cache, project_id, AGENT, &version_hash)
                .await
                .unwrap();
        assert!(similarity::is_strict_superset(&grown_lines, &old_lines));
    }

    #[tokio::test]
    async fn slim_message_writes_rows_directly() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let mut message = make_message(project_id, "");
        message.known_version_hash = Some("someversion".to_string());

        let mut rows = Vec::new();
        handler.process_message(&message, &mut rows).await.unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].static_prompt_version_hash, "someversion");
        // No window touched.
        let win = window::load_window(&handler.cache, &window::window_cache_key(project_id, AGENT))
            .await
            .unwrap();
        assert!(win.is_empty());
    }

    #[tokio::test]
    async fn memo_race_recheck_short_circuits() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let message = make_message(project_id, "some prompt\nbody");
        versions::memo_set(
            &handler.cache,
            project_id,
            &message.full_prompt_hash,
            "racedversion",
        )
        .await;

        let mut rows = Vec::new();
        handler.process_message(&message, &mut rows).await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].static_prompt_version_hash, "racedversion");
    }

    #[tokio::test]
    async fn static_removal_triggers_new_mint() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let (_, old_version) = mint_first_version(&handler, project_id).await;

        // New version: the "body line" static line was REMOVED. The old static
        // set no longer subset-matches → miss → full run on arrival.
        let mut last_rows = Vec::new();
        for i in 0..*MIN_WINDOW {
            let prompt = format!("You are a test agent.\nuser: new-{i}\ntail line");
            let message = make_message(project_id, &prompt);
            let mut rows = Vec::new();
            handler.process_message(&message, &mut rows).await.unwrap();
            last_rows = rows;
        }

        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        // The mixed old+new intersection mints once the cluster stabilizes;
        // the newest registry entry differs from the old version.
        assert!(registry.len() >= 2, "a second version was minted");
        assert_ne!(registry[0].version_hash, old_version);
        assert!(
            !last_rows.is_empty(),
            "new-version spans got rows once minted"
        );
        assert!(
            last_rows
                .iter()
                .any(|r| r.static_prompt_version_hash != old_version)
        );
    }

    #[tokio::test]
    async fn fully_static_prompt_resolves_via_occurrence_threshold() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let prompt = "You are a static agent.\nno dynamic content";

        let mut all_rows = Vec::new();
        for _ in 0..*OCCURRENCE_THRESHOLD {
            let message = make_message(project_id, prompt);
            let mut rows = Vec::new();
            handler.process_message(&message, &mut rows).await.unwrap();
            all_rows.extend(rows);
        }

        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        assert_eq!(registry.len(), 1, "fully-static version minted");
        let version_hash = &registry[0].version_hash;
        // Empty regex list written at registration (nothing to strip) — the
        // verdict is final, no demand-driven generation will ever fire.
        let regexes =
            versions::get_version_regexes(&handler.cache, project_id, AGENT, version_hash)
                .await
                .unwrap();
        assert!(regexes.is_empty());
        // The triggering message got its row; earlier occurrences parked
        // (dropped here — no delay receiver) and would resolve via the memo.
        assert_eq!(all_rows.len(), 1);
        assert_eq!(&all_rows[0].static_prompt_version_hash, version_hash);
        let memo = versions::memo_get(
            &handler.cache,
            project_id,
            &similarity::full_prompt_hash(prompt),
        )
        .await;
        assert_eq!(memo.as_deref(), Some(version_hash.as_str()));
    }

    #[tokio::test]
    async fn exhausted_budget_mints_from_partial_window() {
        let handler = make_handler();
        let mut receiver = delay_receiver(&handler).await;
        let project_id = Uuid::new_v4();

        // Two fresh distinct prompts park (window far below MIN_WINDOW).
        let mut rows = Vec::new();
        for i in 0..2 {
            let message = make_message(project_id, &versioned_prompt(i));
            handler.process_message(&message, &mut rows).await.unwrap();
        }
        assert!(rows.is_empty());
        assert_eq!(drain_parked(&mut receiver).await.len(), 2);

        // A message that spent its whole retry budget mints best-effort from
        // the partial window instead of dropping.
        let mut capped = make_message(project_id, &versioned_prompt(2));
        capped.retry_count = *MAX_RETRIES;
        handler.process_message(&capped, &mut rows).await.unwrap();

        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        assert_eq!(registry.len(), 1, "partial-window mint happened");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].static_prompt_version_hash, registry[0].version_hash);
        // The intersection over the partial cluster still strips the dynamic
        // user line.
        let lines_key =
            versions::version_lines_cache_key(project_id, AGENT, &registry[0].version_hash);
        let static_lines = handler
            .cache
            .get::<Vec<u64>>(&lines_key)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            static_lines,
            similarity::line_hashes("You are a test agent.\nbody line\ntail line")
        );
        // Multi-sample mint: regexes stay absent until demanded.
        assert!(
            versions::get_version_regexes(
                &handler.cache,
                project_id,
                AGENT,
                &registry[0].version_hash
            )
            .await
            .is_none()
        );
        assert!(
            drain_parked(&mut receiver).await.is_empty(),
            "the capped message resolved instead of re-parking"
        );
    }

    #[tokio::test]
    async fn exhausted_budget_single_sample_mints_whole_prompt_as_static() {
        let handler = make_handler();
        let mut receiver = delay_receiver(&handler).await;
        let project_id = Uuid::new_v4();

        // First-ever prompt of an agent, already past its budget: register
        // with an empty regex list (nothing to diff against).
        let mut message = make_message(project_id, &versioned_prompt(0));
        message.retry_count = *MAX_RETRIES;
        let mut rows = Vec::new();
        handler.process_message(&message, &mut rows).await.unwrap();

        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        assert_eq!(registry.len(), 1);
        let version_hash = &registry[0].version_hash;
        let regexes =
            versions::get_version_regexes(&handler.cache, project_id, AGENT, version_hash)
                .await
                .unwrap();
        assert!(regexes.is_empty(), "single sample mints with no regexes");
        assert_eq!(rows.len(), 1);
        assert_eq!(&rows[0].static_prompt_version_hash, version_hash);
        assert!(drain_parked(&mut receiver).await.is_empty());
    }

    #[tokio::test]
    async fn capped_message_drops_when_mint_lock_busy() {
        let handler = make_handler();
        let mut receiver = delay_receiver(&handler).await;
        let project_id = Uuid::new_v4();

        // Another worker is mid-mint for this agent.
        let lock_key = versions::mint_lock_cache_key(project_id, AGENT);
        assert!(
            handler
                .cache
                .try_acquire_lock(&lock_key, MINT_LOCK_TTL_SECONDS)
                .await
                .unwrap()
        );

        let mut message = make_message(project_id, &versioned_prompt(0));
        message.retry_count = *MAX_RETRIES;
        let mut rows = Vec::new();
        handler.process_message(&message, &mut rows).await.unwrap();

        assert!(rows.is_empty());
        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        assert!(registry.is_empty(), "no mint under the busy lock");
        assert!(
            drain_parked(&mut receiver).await.is_empty(),
            "past the cap the message drops instead of re-parking"
        );
    }

    #[tokio::test]
    async fn parked_redelivery_does_not_bump_seen_count() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let message = make_message(project_id, "static\nprompt");

        let mut rows = Vec::new();
        handler.process_message(&message, &mut rows).await.unwrap();
        let mut parked = message.clone();
        parked.retry_count = 1;
        handler.process_message(&parked, &mut rows).await.unwrap();
        handler.process_message(&parked, &mut rows).await.unwrap();

        let win = window::load_window(&handler.cache, &window::window_cache_key(project_id, AGENT))
            .await
            .unwrap();
        assert_eq!(
            win[0].seen_count, 1,
            "redeliveries are the same occurrence — a parked message must not \
             walk the entry toward the fully-static threshold"
        );
    }

    #[tokio::test]
    async fn sampled_probe_mints_new_version_after_addition() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let (_, old_version) = mint_first_version(&handler, project_id).await;

        // Pure ADDITION: a new static line. The old set still subset-matches,
        // so cheap match keeps hitting — only the sampled probe can mint.
        let added = |i: usize| {
            format!("You are a test agent.\nuser: add-{i}\nbody line\nNEW SECTION\ntail line")
        };

        // Without the producer's staleness probe, additions never mint.
        for i in 0..*MIN_WINDOW {
            let message = make_message(project_id, &added(i));
            let mut rows = Vec::new();
            handler.process_message(&message, &mut rows).await.unwrap();
            assert_eq!(
                rows.first().map(|r| r.static_prompt_version_hash.clone()),
                Some(old_version.clone()),
                "cheap match keeps resolving to the old version"
            );
        }
        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        assert_eq!(registry.len(), 1, "no mint without the probe");

        // Now the probe fires: the top-K around a new-version prompt are all
        // new-version, intersection gains the added line, a new hash mints.
        let mut message = make_message(project_id, &added(999));
        message.run_full = true;
        let mut rows = Vec::new();
        handler.process_message(&message, &mut rows).await.unwrap();

        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        assert_eq!(registry.len(), 2, "addition minted a second version");
        let new_version = &registry[0].version_hash;
        assert_ne!(new_version, &old_version);

        // The new static set is a superset including the added line, so the
        // NEXT new-version prompt resolves to the NEW version (largest wins).
        let next = make_message(project_id, &added(1000));
        let mut rows = Vec::new();
        handler.process_message(&next, &mut rows).await.unwrap();
        assert_eq!(&rows[0].static_prompt_version_hash, new_version);
    }

    /// The producer's cheap-match verdict replaces the consumer's own subset
    /// match, but the prompt is a NEW distinct body — so it must still land in
    /// the window, or no future version could ever be minted from it.
    #[tokio::test]
    async fn producer_cheap_match_verdict_still_appends_to_window() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let (_, version_hash) = mint_first_version(&handler, project_id).await;
        let window_key = window::window_cache_key(project_id, AGENT);
        let before = window::load_window(&handler.cache, &window_key)
            .await
            .unwrap()
            .len();

        // Slim: body stripped, verdict supplied, line hashes carried.
        let prompt = versioned_prompt(4242);
        let mut message = make_message(project_id, &prompt);
        message.cheap_matched_version = Some(version_hash.clone());
        message.system_prompt = String::new();

        let mut rows = Vec::new();
        handler.process_message(&message, &mut rows).await.unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].static_prompt_version_hash, version_hash);
        let win = window::load_window(&handler.cache, &window_key)
            .await
            .unwrap();
        assert_eq!(win.len(), before + 1, "slim message grew the window");
        let lines_key = window::window_lines_cache_key(
            project_id,
            AGENT,
            &win.last().unwrap().full_prompt_hash,
        );
        assert_eq!(
            handler
                .cache
                .get::<Vec<u64>>(&lines_key)
                .await
                .unwrap()
                .as_deref(),
            Some(similarity::line_hashes(&prompt).as_slice()),
            "line hashes came off the wire, not the (empty) body, and landed in their own key"
        );
        // The producer does not write the memo; the consumer does.
        assert_eq!(
            versions::memo_get(&handler.cache, project_id, &message.full_prompt_hash)
                .await
                .as_deref(),
            Some(version_hash.as_str())
        );
    }

    /// Legacy messages published before `line_hashes` existed carry an empty
    /// vec; the body is rehashed so they classify exactly as before.
    #[tokio::test]
    async fn legacy_message_without_line_hashes_rehashes_body() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        let mut rows = Vec::new();

        for i in 0..*MIN_WINDOW {
            let mut message = make_message(project_id, &versioned_prompt(i));
            message.line_hashes = Vec::new();
            handler.process_message(&message, &mut rows).await.unwrap();
        }

        let registry = versions::load_registry(&handler.cache, project_id, AGENT)
            .await
            .unwrap();
        assert_eq!(registry.len(), 1);
    }

    #[tokio::test]
    async fn unrelated_prompt_does_not_match_other_agents_version() {
        let handler = make_handler();
        let project_id = Uuid::new_v4();
        mint_first_version(&handler, project_id).await;

        // Same agent hash (same first sentence family key) but content
        // sharing no lines: no subset match, no mint below MIN_WINDOW.
        let message = make_message(project_id, "completely\nunrelated\ncontent");
        let mut rows = Vec::new();
        handler.process_message(&message, &mut rows).await.unwrap();
        assert!(rows.is_empty());
    }
}
