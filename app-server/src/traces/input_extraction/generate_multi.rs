//! Multi-sample extraction-regex generation: the agent behind a prompt
//! version's cached user-task regex.
//!
//! Same tool loop as the single-sample pipeline, but every probe runs against
//! ALL of the cohort's accumulated samples, and a submit is accepted only when
//! it survives all of them.
//!
//! **On the acceptance check.** The plan was to mirror the static-prompt
//! extractor and require the REMOVED text to be identical across samples. That
//! does not transfer: over there the regexes strip dynamic parts and what
//! remains is the static skeleton, so the residual really is invariant. Here the
//! regex KEEPS the dynamic part (the task) and discards scaffolding that is
//! itself part static and part injected dynamic state — so the removed text
//! differs per sample by construction. What actually discriminates is the
//! multi-sample match itself: a pattern anchored on one sample's own words fails
//! to match the others, so requiring a non-empty capture on every sample IS the
//! generalization test — and it is the whole test.
//!
//! **The passthrough `(?s)(.*)` is a legitimate answer.** Plenty of cohorts carry
//! no scaffolding at all — a bare chat message under a system prompt — and there
//! the whole text IS the instruction. An earlier acceptance clause also required
//! a submit to discard something somewhere, which made those cohorts
//! unsatisfiable: the agent burned its full budget, cached nothing, every trace
//! paid a direct extraction, and the hourly retry re-ran the doomed agent
//! forever. Note the asymmetry with [`GenerationVerdict::Exhausted`], which still
//! caches nothing — a passthrough the model CHOSE is a verdict; one the server
//! invents after the model failed is a guess.

use std::sync::Arc;

use super::generate::{GenerationVerdict, call_llm, extraction_provider};
use super::regex::{ApplyRegexResult, apply_regex, apply_result_to_json};
use super::self_tracing::{self, SpanBuilder, SpanScope};
use crate::llm::LlmClient;
use crate::llm::models::{
    ModelSize, ProviderContent, ProviderFunctionDeclaration, ProviderFunctionResponse,
    ProviderGenerationConfig, ProviderPart, ProviderRequest, ProviderThinkingConfig,
    ProviderThinkingLevel, ProviderTool,
};

/// Total LLM-call budget per run (initial call + probe round-trips). Higher than
/// the single-sample pipeline's: reconciling several samples legitimately takes
/// more probing.
const MAX_LLM_CALLS: usize = 8;
const MAX_OUTPUT_TOKENS: i32 = 16384;

const TRY_TOOL_NAME: &str = "try_extraction_regex";
const SUBMIT_TOOL_NAME: &str = "submit_extraction_regex";

/// Self-tracing span names, deliberately distinct from the single-sample
/// pipeline's: the two runs differ in cost, sample count and failure modes, so
/// sharing a name made them indistinguishable in the trace UI. Must be literals
/// `self_tracing::SpanBuilder` matches on.
///
/// `PROBE_SPAN_NAME` is separate from [`TRY_TOOL_NAME`] on purpose — that
/// constant is the function-declaration name the MODEL calls and the system
/// prompt references it by name, so renaming it would change the tool contract.
const GENERATE_SPAN_NAME: &str = "generate_extraction_regex_multi";
const PROBE_SPAN_NAME: &str = "try_extraction_regex_multi";

const MULTI_GENERATION_SYSTEM_PROMPT: &str = r#"# Task

You are shown SEVERAL messages that were sent as input to the same AI agent, built from the same template. Write ONE regex that extracts the instruction the agent was asked to carry out and discards everything the harness injected around it — a regex that works on every one of them.

# The template model

Messages like these are produced by templates. A harness takes an instruction (written by a person, a parent agent, a ticket, a bot) and assembles the final message by inserting it — together with injected material such as environment info, file contents, tool inventories, reminders, and metadata — into a fixed layout.

Every piece of a message is one of two kinds of text:
- STATIC text comes from the template and recurs verbatim in every message built from it: section delimiters, tag names, labels, headers, boilerplate sentences.
- VARIABLE text differs per message: the instruction itself, and the injected data.

The samples below are your evidence for which is which. Text that appears verbatim in ALL of them is static and can anchor your pattern; text that differs between them cannot. Your regex will be cached and re-applied to future messages from this same template, so anchoring on anything that varies makes it fail or mis-extract.

# Two kinds of variable text — only one of them is the instruction

VARIABLE text itself splits into two kinds that are easy to conflate, because both change from message to message:
- The user's own words: what the requester actually typed or asked — the instruction itself, or content they explicitly provided for the agent to work on (a pasted document, quoted text, embedded data they want processed). This is what you must capture.
- Injected DYNAMIC STATE: harness-supplied data that also varies per message but was never authored by the requester — a live current-state summary, a snapshot of some external system, tool output, "current page contents," a data dump attached for the agent's situational awareness. This changes per message just like the instruction does, but it is scaffolding, not instruction — strip it the same as any static boilerplate.

Do not use "changes between samples" as a proxy for "is the instruction" — that test only tells you a span is VARIABLE, not which kind. Ask instead: did the requester write or provide this themselves as part of what they want done, or did the harness attach it as background the agent might need?

# What scaffolding looks like

Injected blocks are delimited in whatever syntax the harness happened to pick, and the syntax itself carries no meaning. XML-like tags, delimiter lines ("=== ENVIRONMENT ==="), markdown headings, ALL-CAPS labels, bracketed section headers, and JSON envelopes all play the same role. Classify every marker by its FUNCTION — does it delimit injected material, or the instruction? — never by its syntax.

Beware markup living INSIDE variable text: HTML or markdown inside a quoted PR body, bot comment, or pasted document is part of the instruction's content, not scaffolding, even when it looks tag-like. HTML comments (<!-- … -->) are never anchors.

The messages may carry "== lmnr_part_separator ==" lines separating sibling message parts. They are present when your regex runs and are stripped from the captured text afterwards.

# Procedure

1. Diff the samples in your head: which blocks are byte-identical across all of them (static scaffolding), which differ (variable), and which of the differing blocks is the instruction? If the samples share nothing at all — wildly different shapes with no common markers — that is the no-scaffolding case, and the whole message is the instruction.
2. Pick anchor material from the STATIC text nearest the instruction on each side. Verify the anchor text appears in EVERY sample — that is the whole reason you were given several.
3. Write the pattern with exactly one capture group around the instruction. Recurring layouts:
   - Scaffolding first, instruction last → (?s).*STATIC_END\s*(.*) — the leading greedy .* is mandatory: it anchors on the LAST occurrence of STATIC_END, not the first.
   - Instruction first, scaffolding after → (?s)^(.*?)STATIC_START — the ^ plus LAZY (.*?) are mandatory: they anchor on the FIRST occurrence of STATIC_START. Only valid when the messages do not begin with scaffolding.
   - Instruction inside its own envelope → (?s)ENVELOPE_START\s*(.*?)\s*ENVELOPE_END.
   - No scaffolding, or no anchor that holds across every sample → (?s)(.*) — passthrough. This is a real answer, not a failure: many templates inject nothing around the instruction.
4. Narrow when the structure supports it: if the instruction region is itself structured (say, a JSON object where one field is the task), capture just that field, anchoring on its static field name.
5. Probe with try_extraction_regex — it applies your pattern to EVERY sample and shows you each result. Read all of them: a pattern that extracts beautifully from sample 1 and nothing from sample 3 is anchored on sample 1's variable text.
6. Finish with submit_extraction_regex. A submission is accepted when it extracts non-empty text from EVERY sample.

# Tools

- try_extraction_regex: probes a candidate pattern against all samples and returns, per sample, the FINAL user-visible result (capture group 1 with the "== lmnr_part_separator ==" lines stripped and parts re-joined). Every pattern always runs against the ORIGINAL samples; never write a pattern against a probe's result text.
- submit_extraction_regex: submits the final pattern (starts with "(?s)", no surrounding quotes) and ends the run. You may probe as many times as you want first. A rejected submission is returned to you with the reason — fix the pattern and submit again.

# Rules

- Exactly one capture group. Always prefix with (?s).
- Anchor text must appear VERBATIM in every sample. Never invent markers and never copy marker names from these instructions.
- Never nest quantifiers (no (a+)+-style patterns).
- Look for an anchor before falling back to the passthrough — an anchor that holds across every sample is always the better answer. But if the samples genuinely share no static text, submit (?s)(.*) rather than inventing an anchor that only some of them contain."#;

/// Per-sample outcome of probing one pattern across the cohort.
struct MultiProbeVerdict {
    results: Vec<ApplyRegexResult>,
    /// Every sample yielded a non-empty capture. A pattern anchored on one
    /// sample's own words fails here — the generalization test, and the whole
    /// acceptance criterion.
    matches_all: bool,
}

impl MultiProbeVerdict {
    fn accepted(&self) -> bool {
        self.matches_all
    }
}

fn probe_all(pattern: &str, samples: &[String]) -> MultiProbeVerdict {
    let results: Vec<ApplyRegexResult> = samples
        .iter()
        .map(|sample| apply_regex(pattern, sample))
        .collect();
    let matches_all = results
        .iter()
        .all(|r| matches!(r, ApplyRegexResult::Extracted(_)));
    MultiProbeVerdict {
        results,
        matches_all,
    }
}

/// The per-sample probe response the model reads.
fn verdict_to_json(verdict: &MultiProbeVerdict) -> serde_json::Value {
    let samples: Vec<serde_json::Value> = verdict
        .results
        .iter()
        .enumerate()
        .map(|(i, result)| {
            let mut entry = apply_result_to_json(result);
            if let Some(obj) = entry.as_object_mut() {
                obj.insert("sample".to_string(), serde_json::json!(i + 1));
            }
            entry
        })
        .collect();
    serde_json::json!({
        "accepted_if_submitted": verdict.accepted(),
        "extracts_from_every_sample": verdict.matches_all,
        "samples": samples,
    })
}

/// Only reachable when the pattern failed [`MultiProbeVerdict::accepted`], so
/// the verdict itself carries no extra information — the reason is either an
/// unusable argument or a failure to match every sample.
fn reject_reason(pattern: &str) -> serde_json::Value {
    let detail = if pattern.is_empty() {
        "the `regex` argument is missing or empty; probe with try_extraction_regex, then submit \
         a pattern that extracts the instruction from every sample"
    } else {
        "the pattern does not extract non-empty text from every sample — it is anchored on text \
         that only some of them contain; find static text present in ALL samples and anchor on \
         that, or submit the passthrough (?s)(.*) if the samples share no scaffolding at all"
    };
    serde_json::json!({ "result": "rejected", "detail": detail })
}

/// Render the samples as the run's single user message.
fn samples_message(samples: &[String]) -> String {
    let mut out = String::new();
    for (i, sample) in samples.iter().enumerate() {
        out.push_str(&format!(
            "===== SAMPLE {} of {} =====\n{}\n\n",
            i + 1,
            samples.len(),
            sample
        ));
    }
    out
}

/// Generate one extraction regex that works across `samples`.
///
/// Errors only when an LLM call exhausts its transient-retry budget. Recoverable
/// slips (no tool call, a rejected submit) are pushed back to the model within
/// the call budget. When the budget runs out, the LATEST probe that passed
/// validation is returned instead of nothing — models routinely "improve" a
/// pattern after their last successful test, which is why the tool's verdict is
/// trusted over the transcript's final answer. With no verified probe at all the
/// verdict is [`GenerationVerdict::Exhausted`], and the caller caches nothing:
/// a whole-message passthrough would be worse than the direct-extraction
/// fallback it would replace.
pub async fn generate_extraction_regex_multi(
    llm_client: &Arc<LlmClient>,
    samples: &[String],
    scope: &SpanScope,
) -> anyhow::Result<GenerationVerdict> {
    let mut contents = vec![ProviderContent {
        role: Some("user".to_string()),
        parts: Some(vec![ProviderPart {
            text: Some(samples_message(samples)),
            ..Default::default()
        }]),
    }];
    let mut verified: Option<String> = None;

    for _ in 0..MAX_LLM_CALLS {
        let request = build_request(contents.clone());
        let response = call_llm(llm_client, &request, scope, GENERATE_SPAN_NAME).await?;

        let model_content = response
            .candidates
            .as_ref()
            .and_then(|c| c.first())
            .and_then(|c| c.content.as_ref());
        let parts: &[ProviderPart] = model_content
            .and_then(|c| c.parts.as_deref())
            .unwrap_or_default();

        // An accepted submit ends the run even when probes ride the same
        // response — the model already committed.
        for part in parts {
            if let Some(fc) = &part.function_call
                && fc.name == SUBMIT_TOOL_NAME
                && let Some(pattern) = submitted_pattern(fc.args.as_ref())
                && probe_all(&pattern, samples).accepted()
            {
                return Ok(GenerationVerdict::Pattern(pattern));
            }
        }

        // Answer EVERY tool call in the turn (providers require a response per
        // call), tracking any probe that would have been accepted.
        let mut tool_responses: Vec<ProviderPart> = Vec::new();
        for part in parts {
            let Some(fc) = &part.function_call else {
                continue;
            };
            let pattern = submitted_pattern(fc.args.as_ref()).unwrap_or_default();
            let response = match fc.name.as_str() {
                TRY_TOOL_NAME => {
                    let verdict = probe_samples_traced(&pattern, samples, scope);
                    if verdict.accepted() {
                        verified = Some(pattern.clone());
                    }
                    verdict_to_json(&verdict)
                }
                SUBMIT_TOOL_NAME => reject_reason(&pattern),
                other => serde_json::json!({
                    "result": "error",
                    "detail": format!(
                        "unknown tool `{other}`; the only tools are \
                         try_extraction_regex and submit_extraction_regex"
                    ),
                }),
            };
            tool_responses.push(ProviderPart {
                function_response: Some(ProviderFunctionResponse {
                    id: fc.id.clone(),
                    name: fc.name.clone(),
                    response,
                }),
                ..Default::default()
            });
        }

        contents.push(model_content.cloned().unwrap_or(ProviderContent {
            role: Some("model".to_string()),
            parts: None,
        }));
        contents.push(ProviderContent {
            role: Some("user".to_string()),
            parts: Some(if tool_responses.is_empty() {
                vec![ProviderPart {
                    text: Some(
                        "Respond with a tool call: probe a candidate pattern with \
                         try_extraction_regex, or finish with submit_extraction_regex."
                            .to_string(),
                    ),
                    ..Default::default()
                }]
            } else {
                tool_responses
            }),
        });
    }

    match verified {
        Some(pattern) => {
            log::info!(
                "user-task: multi-sample generation exhausted its budget; using the last \
                 tool-verified pattern"
            );
            Ok(GenerationVerdict::Pattern(pattern))
        }
        None => {
            log::warn!(
                "user-task: multi-sample generation exhausted its {MAX_LLM_CALLS}-call budget \
                 with no verified pattern"
            );
            Ok(GenerationVerdict::Exhausted)
        }
    }
}

fn submitted_pattern(args: Option<&serde_json::Value>) -> Option<String> {
    args.and_then(|a| a.get("regex"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(str::to_string)
}

fn probe_samples_traced(pattern: &str, samples: &[String], scope: &SpanScope) -> MultiProbeVerdict {
    let span = SpanBuilder::tool(scope, PROBE_SPAN_NAME)
        .input(&serde_json::json!({ "regex": pattern }))
        .build();
    let verdict = probe_all(pattern, samples);
    self_tracing::set_output(&span, &verdict_to_json(&verdict));
    verdict
}

fn build_request(contents: Vec<ProviderContent>) -> ProviderRequest {
    let regex_param = serde_json::json!({
        "type": "object",
        "properties": {
            "regex": {
                "type": "string",
                "description": "A regex pattern starting with (?s) with exactly one capture group."
            }
        },
        "required": ["regex"]
    });
    ProviderRequest {
        contents,
        system_instruction: Some(ProviderContent {
            role: None,
            parts: Some(vec![ProviderPart {
                text: Some(MULTI_GENERATION_SYSTEM_PROMPT.to_string()),
                ..Default::default()
            }]),
        }),
        tools: Some(vec![ProviderTool {
            function_declarations: vec![
                ProviderFunctionDeclaration {
                    name: TRY_TOOL_NAME.to_string(),
                    description: "Probe a candidate regex against EVERY sample and get each sample's final extraction result back. Call as many times as needed before submitting.".to_string(),
                    parameters: regex_param.clone(),
                },
                ProviderFunctionDeclaration {
                    name: SUBMIT_TOOL_NAME.to_string(),
                    description: "Submit the chosen regex and end the run. Accepted if it extracts non-empty text from every sample.".to_string(),
                    parameters: regex_param,
                },
            ],
        }]),
        generation_config: Some(ProviderGenerationConfig {
            temperature: Some(1.0),
            max_output_tokens: Some(MAX_OUTPUT_TOKENS),
            thinking_config: Some(ProviderThinkingConfig {
                include_thoughts: Some(true),
                thinking_level: Some(ProviderThinkingLevel::Medium),
            }),
            ..Default::default()
        }),
        service_tier: None,
        provider: Some(extraction_provider()),
        model_size: Some(ModelSize::Medium),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn samples() -> Vec<String> {
        vec![
            "<env>cwd: /a</env>\n\nsummarize the report".to_string(),
            "<env>cwd: /b</env>\n\nfix the failing test".to_string(),
            "<env>cwd: /c</env>\n\nrename the module".to_string(),
        ]
    }

    #[test]
    fn generalizing_anchor_is_accepted() {
        assert!(probe_all(r"(?s).*</env>\s*(.*)", &samples()).accepted());
    }

    /// The whole reason probes run against every sample: a pattern anchored on
    /// one sample's own words extracts nothing from the others.
    #[test]
    fn anchor_on_one_samples_variable_text_is_rejected() {
        let verdict = probe_all(r"(?s).*cwd: /a</env>\s*(.*)", &samples());
        assert!(!verdict.matches_all);
        assert!(!verdict.accepted());
    }

    /// Unscaffolded cohorts are real — a bare chat message under a system
    /// prompt — and there the whole text IS the instruction. Requiring a submit
    /// to discard something left those cohorts permanently uncacheable, so the
    /// agent re-ran on every retry interval and never converged.
    #[test]
    fn passthrough_is_accepted() {
        let unscaffolded = vec![
            "summarize the report".to_string(),
            "fix the failing test".to_string(),
        ];
        assert!(probe_all(r"(?s)(.*)", &unscaffolded).accepted());
        // Anchored spelling of the same pattern.
        assert!(probe_all(r"(?s)^(.*)$", &unscaffolded).accepted());
    }

    /// Acceptance is match-only, so a pattern capturing nothing is still the
    /// one thing that cannot be submitted.
    #[test]
    fn empty_capture_is_still_rejected() {
        assert!(!probe_all(r"(?s)()", &samples()).accepted());
    }

    #[test]
    fn samples_message_labels_every_sample() {
        let rendered = samples_message(&samples());
        assert!(rendered.contains("===== SAMPLE 1 of 3 ====="));
        assert!(rendered.contains("===== SAMPLE 3 of 3 ====="));
        assert!(rendered.contains("rename the module"));
    }
}
