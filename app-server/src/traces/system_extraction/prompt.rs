//! User-message construction for the static-extractor agent.

use super::diff::line_diff;

/// Full instruction doc used verbatim as the agent's system prompt.
pub const SYSTEM_INSTRUCTIONS: &str = include_str!("instructions.md");

/// Build the single user message from the example prompts.
pub fn build_user_message(examples: &[String], include_diff: bool) -> String {
    let n = examples.len();
    let mut message = format!(
        "Here are {n} example system prompts from the SAME template family. They differ only in \
         dynamically-injected values. Hypothesize and test regexes with the `regex` tool (it runs \
         them against ALL shown examples), then produce the final ordered list of regexes that \
         strip all dynamic spans so every example collapses to the same static skeleton.\n\n"
    );

    message.push_str(
        "MANDATORY HARDENING PASS before you finish: once the tool reports \
         isResultInAllIdenticalOutput: true, re-read every final regex and widen it so it still \
         works on UNSEEN prompts from the same family that may contain (a) optional sections in a \
         different ORDER or of types you never saw, (b) state lines rendered differently than in \
         these examples, (c) values outside the observed set. Replace instance-specific anchors \
         and observed-value alternations with zone sweeps and wide value patterns, then re-verify \
         with the tool.\n\n",
    );

    message.push_str(
        "When you are done, respond with ONLY a JSON array of the final ordered regex pattern \
         strings — e.g. [\"^Current date: .*$\", \"(?<=Working directory: ).*\"] — with no prose \
         and no markdown code fences.\n\n",
    );

    let examples_block = examples
        .iter()
        .enumerate()
        .map(|(i, example)| {
            format!(
                "Example {} of {n}:\n<system_prompt>\n{example}\n</system_prompt>",
                i + 1
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    message.push_str(&examples_block);

    if include_diff && n >= 2 {
        message.push_str(&format!(
            "\n\nDiff of Example 1 vs Example 2 (shows what varies dynamically):\n```diff\n{}\n```",
            line_diff(&examples[0], &examples[1])
        ));
    }

    message
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_message_with_examples_and_diff() {
        let examples = vec![
            "static\ndate: 2026-01-01".to_string(),
            "static\ndate: 2026-01-02".to_string(),
        ];
        let message = build_user_message(&examples, true);
        assert!(message.starts_with("Here are 2 example system prompts"));
        assert!(message.contains("MANDATORY HARDENING PASS"));
        assert!(message.contains("respond with ONLY a JSON array"));
        assert!(message.contains(
            "Example 1 of 2:\n<system_prompt>\nstatic\ndate: 2026-01-01\n</system_prompt>"
        ));
        assert!(message.contains(
            "Example 2 of 2:\n<system_prompt>\nstatic\ndate: 2026-01-02\n</system_prompt>"
        ));
        assert!(message.contains("Diff of Example 1 vs Example 2"));
        assert!(message.contains("```diff\n  static\n- date: 2026-01-01\n+ date: 2026-01-02\n```"));
    }

    #[test]
    fn omits_diff_when_disabled_or_single_example() {
        let examples = vec!["only one".to_string()];
        assert!(!build_user_message(&examples, true).contains("Diff of Example"));

        let two = vec!["a".to_string(), "b".to_string()];
        assert!(!build_user_message(&two, false).contains("Diff of Example"));
    }
}
