use serde::Serialize;

const CONTEXT_PADDING: usize = 256;
const MAX_MATCHES_PER_SEARCH: usize = 5;
const MAX_POSITIONS_PER_WORD: usize = 50;
const MIN_PROXIMITY_WORD_LEN: usize = 2;

#[derive(Debug, Clone, Serialize)]
pub struct SearchMatch {
    pub snippet: String,
    pub offset: usize,
}

/// Runs normalized substring search and word proximity search, then merges
/// and deduplicates the results. Normalized search handles case differences
/// and whitespace variations. Word proximity finds regions where multiple
/// query words cluster together regardless of order or extra words between them.
pub fn fuzzy_search(content: &str, query: &str) -> Vec<SearchMatch> {
    if query.is_empty() || content.is_empty() {
        return vec![];
    }

    let normalized = find_normalized_matches(content, query);
    let proximity = find_word_proximity_matches(content, query);

    deduplicate_matches(normalized, proximity)
}

fn deduplicate_matches(mut a: Vec<SearchMatch>, b: Vec<SearchMatch>) -> Vec<SearchMatch> {
    a.extend(b);
    a.sort_by_key(|m| m.offset);

    let mut result: Vec<SearchMatch> = Vec::new();
    for m in a {
        let dominated = result
            .iter()
            .any(|existing| m.offset.abs_diff(existing.offset) < CONTEXT_PADDING);
        if !dominated {
            result.push(m);
        }
    }

    result.truncate(MAX_MATCHES_PER_SEARCH);
    result
}

fn extract_snippet(content: &str, offset: usize, match_len: usize) -> SearchMatch {
    let start = offset.saturating_sub(CONTEXT_PADDING);
    let end = (offset + match_len + CONTEXT_PADDING).min(content.len());
    let start = content.floor_char_boundary(start);
    let end = content.ceil_char_boundary(end);
    SearchMatch {
        snippet: content[start..end].to_string(),
        offset,
    }
}

// ---------------------------------------------------------------------------
// Normalized search: case-insensitive + whitespace-collapsed
// ---------------------------------------------------------------------------

/// Lowercase and collapse whitespace runs to a single space.
/// Returns `(prepared_string, byte_map)` where `byte_map[i]` is the byte offset
/// in the original string corresponding to byte `i` in the prepared string.
fn prepare_for_search(s: &str) -> (String, Vec<usize>) {
    let mut result = String::with_capacity(s.len());
    let mut byte_map: Vec<usize> = Vec::with_capacity(s.len());
    let mut in_ws = false;

    for (orig_pos, ch) in s.char_indices() {
        if ch.is_whitespace() {
            if !in_ws {
                result.push(' ');
                byte_map.push(orig_pos);
                in_ws = true;
            }
        } else {
            in_ws = false;
            for lc in ch.to_lowercase() {
                let start = result.len();
                result.push(lc);
                for _ in start..result.len() {
                    byte_map.push(orig_pos);
                }
            }
        }
    }

    (result, byte_map)
}

fn find_normalized_matches(content: &str, query: &str) -> Vec<SearchMatch> {
    let (prepared_content, byte_map) = prepare_for_search(content);
    let (prepared_query, _) = prepare_for_search(query);

    if prepared_query.is_empty() {
        return vec![];
    }

    prepared_content
        .match_indices(&prepared_query)
        .take(MAX_MATCHES_PER_SEARCH)
        .filter_map(|(prepared_offset, _)| {
            let orig_offset = byte_map.get(prepared_offset).copied()?;
            Some(extract_snippet(content, orig_offset, query.len()))
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Word proximity search
// ---------------------------------------------------------------------------
//
// Splits the query into words, finds all occurrences of each word in the
// content (case-insensitive), then uses a sliding-window / minimum-window
// algorithm to find regions where multiple query words cluster together.

fn find_word_proximity_matches(content: &str, query: &str) -> Vec<SearchMatch> {
    let query_words: Vec<String> = query
        .split_whitespace()
        .map(|w| w.to_lowercase())
        .filter(|w| w.len() >= MIN_PROXIMITY_WORD_LEN)
        .collect();

    if query_words.len() < 2 {
        return vec![];
    }

    let content_lower = content.to_lowercase();

    let mut positions: Vec<(usize, usize)> = Vec::new();
    for (word_idx, word) in query_words.iter().enumerate() {
        let mut start = 0;
        let mut count = 0;
        while let Some(rel_pos) = content_lower[start..].find(word.as_str()) {
            positions.push((start + rel_pos, word_idx));
            start += rel_pos + 1;
            count += 1;
            if count >= MAX_POSITIONS_PER_WORD {
                break;
            }
        }
    }

    let found_words: std::collections::HashSet<usize> =
        positions.iter().map(|(_, idx)| *idx).collect();
    if found_words.len() < 2 {
        return vec![];
    }

    positions.sort_by_key(|&(offset, _)| offset);

    let n_words = query_words.len();
    let total_query_bytes: usize = query_words.iter().map(|w| w.len()).sum();
    let max_window_bytes = total_query_bytes * 5 + 200;

    let mut counts = vec![0usize; n_words];
    let mut distinct = 0usize;
    let mut left = 0usize;
    let mut best_windows: Vec<(usize, usize, usize)> = Vec::new();

    for right in 0..positions.len() {
        let (off_r, widx_r) = positions[right];
        counts[widx_r] += 1;
        if counts[widx_r] == 1 {
            distinct += 1;
        }

        while left < right {
            let (off_l, _) = positions[left];
            if off_r.saturating_sub(off_l) > max_window_bytes {
                let (_, widx_l) = positions[left];
                counts[widx_l] -= 1;
                if counts[widx_l] == 0 {
                    distinct -= 1;
                }
                left += 1;
            } else {
                break;
            }
        }

        while left < right {
            let (_, widx_l) = positions[left];
            if counts[widx_l] > 1 {
                counts[widx_l] -= 1;
                left += 1;
            } else {
                break;
            }
        }

        if distinct >= 2 {
            let (off_l, _) = positions[left];
            let end = off_r + query_words[widx_r].len();
            best_windows.push((off_l, end, distinct));
        }
    }

    if best_windows.is_empty() {
        return vec![];
    }

    best_windows.sort_by(|a, b| b.2.cmp(&a.2).then_with(|| (a.1 - a.0).cmp(&(b.1 - b.0))));

    let mut selected: Vec<(usize, usize)> = Vec::new();
    let mut results = Vec::new();

    for &(start, end, _) in &best_windows {
        if results.len() >= MAX_MATCHES_PER_SEARCH {
            break;
        }

        let overlaps = selected.iter().any(|&(s, e)| start.max(s) < end.min(e));
        if overlaps {
            continue;
        }

        selected.push((start, end));
        results.push(extract_snippet(content, start, end - start));
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===================================================================
    // fuzzy_search — integration tests
    // ===================================================================

    #[test]
    fn test_empty_query_returns_nothing() {
        assert!(fuzzy_search("hello world", "").is_empty());
    }

    #[test]
    fn test_empty_content_returns_nothing() {
        assert!(fuzzy_search("", "hello").is_empty());
    }

    #[test]
    fn test_exact_case_match() {
        let m = fuzzy_search("hello world", "hello");
        assert_eq!(m.len(), 1);
        assert!(m[0].snippet.contains("hello"));
    }

    #[test]
    fn test_case_insensitive_match() {
        let m = fuzzy_search("Hello World", "hello world");
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn test_whitespace_normalized_match() {
        let m = fuzzy_search("Hello   World", "hello world");
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn test_word_proximity_match() {
        let m = fuzzy_search(
            "The user clicked on the submit button successfully",
            "user button",
        );
        assert!(!m.is_empty());
        assert!(m[0].snippet.contains("user"));
        assert!(m[0].snippet.contains("button"));
    }

    #[test]
    fn test_no_match_at_all() {
        assert!(fuzzy_search("hello world", "zzzzz qqqqq").is_empty());
    }

    #[test]
    fn test_normalized_and_proximity_deduplicated() {
        // "authentication error" matches normalized AND proximity at the same spot
        let m = fuzzy_search(
            "the authentication error was logged",
            "authentication error",
        );
        // Should not produce duplicate snippets at the same offset
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn test_proximity_adds_results_normalized_misses() {
        // Normalized won't find "user button" (words aren't adjacent),
        // but proximity will
        let m = fuzzy_search("the user clicked on the submit button", "user button");
        assert_eq!(m.len(), 1);
    }

    // ===================================================================
    // Normalized search
    // ===================================================================

    #[test]
    fn test_norm_simple() {
        let m = find_normalized_matches("hello world foo bar", "world");
        assert_eq!(m.len(), 1);
        assert!(m[0].snippet.contains("world"));
    }

    #[test]
    fn test_norm_no_match() {
        assert!(find_normalized_matches("hello world", "xyz").is_empty());
    }

    #[test]
    fn test_norm_multiple() {
        assert!(find_normalized_matches("foo bar foo baz foo", "foo").len() == 3);
    }

    #[test]
    fn test_norm_empty_query() {
        assert!(find_normalized_matches("hello", "").is_empty());
    }

    #[test]
    fn test_norm_brackets() {
        let content = r#"{"index": "[3352] Summer 2025 checkbox"}"#;
        let m = find_normalized_matches(content, "[3352]");
        assert_eq!(m.len(), 1);
        assert!(m[0].snippet.contains("[3352]"));
    }

    #[test]
    fn test_norm_context_padding() {
        let content = "aaaaaaaaaa_PREFIX_match_here_SUFFIX_bbbbbbbbbb";
        let m = find_normalized_matches(content, "match_here");
        assert_eq!(m.len(), 1);
        assert!(m[0].snippet.contains("PREFIX"));
        assert!(m[0].snippet.contains("SUFFIX"));
    }

    #[test]
    fn test_norm_max_matches_cap() {
        let content = "ab ".repeat(MAX_MATCHES_PER_SEARCH + 10);
        let m = find_normalized_matches(content.trim(), "ab");
        assert_eq!(m.len(), MAX_MATCHES_PER_SEARCH);
    }

    #[test]
    fn test_norm_multibyte_utf8() {
        let m = find_normalized_matches("价格是 hello 世界", "hello");
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn test_norm_mixed_case() {
        let m = find_normalized_matches("ERROR: something failed", "error: something failed");
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn test_norm_extra_spaces() {
        let m = find_normalized_matches("hello   world", "hello world");
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn test_norm_newlines() {
        let m = find_normalized_matches("hello\n\nworld", "hello world");
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn test_norm_tabs_mixed() {
        let m = find_normalized_matches("hello\t  \n world", "hello world");
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn test_norm_query_has_extra_spaces() {
        let m = find_normalized_matches("hello world", "hello   world");
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn test_norm_offset_maps_back_correctly() {
        let m = find_normalized_matches("AB  CD", "ab cd");
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].offset, 0);
    }

    // ===================================================================
    // Word proximity
    // ===================================================================

    #[test]
    fn test_prox_adjacent_words() {
        let m = find_word_proximity_matches("the user clicked on the button", "user button");
        assert_eq!(m.len(), 1);
        assert!(m[0].snippet.contains("user"));
        assert!(m[0].snippet.contains("button"));
    }

    #[test]
    fn test_prox_reversed_order() {
        let m = find_word_proximity_matches("the button was clicked by the user", "user button");
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn test_prox_case_insensitive() {
        let m = find_word_proximity_matches(
            "Authentication has FAILED for user",
            "authentication failed",
        );
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn test_prox_single_word_skipped() {
        assert!(find_word_proximity_matches("hello world", "hello").is_empty());
    }

    #[test]
    fn test_prox_no_words_found() {
        assert!(find_word_proximity_matches("hello world", "foo bar").is_empty());
    }

    #[test]
    fn test_prox_only_one_word_found() {
        assert!(find_word_proximity_matches("hello world", "hello xyzabc").is_empty());
    }

    #[test]
    fn test_prox_partial_match_3_words() {
        let m = find_word_proximity_matches(
            "error code 401 authentication denied",
            "error authentication missing",
        );
        assert_eq!(m.len(), 1);
        assert!(m[0].snippet.contains("error"));
        assert!(m[0].snippet.contains("authentication"));
    }

    #[test]
    fn test_prox_words_too_far_apart() {
        let padding = "x ".repeat(500);
        let content = format!("user {} button", padding);
        let m = find_word_proximity_matches(&content, "user button");
        assert!(m.is_empty());
    }

    #[test]
    fn test_prox_json_content() {
        let content = r#"{"user_id": "12345", "action": "clicked", "target": "submit_button"}"#;
        let m = find_word_proximity_matches(content, "user_id clicked submit_button");
        assert_eq!(m.len(), 1);
    }

    #[test]
    fn test_prox_short_words_filtered() {
        assert!(find_word_proximity_matches("this is a test", "a test").is_empty());
    }

    #[test]
    fn test_prox_multiple_clusters() {
        let content = "error in auth module ... some other text ... error in auth handler";
        let m = find_word_proximity_matches(content, "error auth");
        assert_eq!(m.len(), 2);
    }

    #[test]
    fn test_prox_deduplication() {
        // With CONTEXT_PADDING=256 on a short string, all snippets cover the full content,
        // but the proximity deduplication works on window overlap — distinct non-overlapping
        // windows each produce a match. The final dedup in fuzzy_search merges by offset
        // proximity.
        let content = "err auth err auth err auth";
        let m = find_word_proximity_matches(content, "err auth");
        assert!(!m.is_empty());
        assert_eq!(m.len(), 3);
    }

    // ===================================================================
    // Helpers
    // ===================================================================

    #[test]
    fn test_prepare_lowercase_and_collapse() {
        let (result, _) = prepare_for_search("Hello   World\n\nTest");
        assert_eq!(result, "hello world test");
    }

    #[test]
    fn test_prepare_offset_mapping() {
        let (result, map) = prepare_for_search("AB  CD");
        assert_eq!(result, "ab cd");
        assert_eq!(map[0], 0);
        assert_eq!(map[1], 1);
        assert_eq!(map[2], 2);
        assert_eq!(map[3], 4);
        assert_eq!(map[4], 5);
    }

    #[test]
    fn test_prepare_empty_input() {
        let (result, map) = prepare_for_search("");
        assert!(result.is_empty());
        assert!(map.is_empty());
    }

    #[test]
    fn test_prepare_all_whitespace() {
        let (result, map) = prepare_for_search("   \n\t  ");
        assert_eq!(result, " ");
        assert_eq!(map.len(), 1);
    }

    #[test]
    fn test_snippet_at_start() {
        let s = extract_snippet("hello world this is content", 0, 5);
        assert!(s.snippet.starts_with("hello"));
        assert_eq!(s.offset, 0);
    }

    #[test]
    fn test_snippet_at_end() {
        let content = "some content here";
        let s = extract_snippet(content, 13, 4);
        assert!(s.snippet.contains("here"));
    }

    #[test]
    fn test_snippet_multibyte_boundaries() {
        let content = "价格是 hello 世界";
        let idx = content.find("hello").unwrap();
        let s = extract_snippet(content, idx, 5);
        assert!(s.snippet.contains("hello"));
    }

    #[test]
    fn test_dedup_removes_nearby_duplicates() {
        let a = vec![SearchMatch {
            snippet: "aaa".to_string(),
            offset: 100,
        }];
        let b = vec![SearchMatch {
            snippet: "bbb".to_string(),
            offset: 110,
        }];
        let result = deduplicate_matches(a, b);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].offset, 100);
    }

    #[test]
    fn test_dedup_keeps_distant_matches() {
        let a = vec![SearchMatch {
            snippet: "aaa".to_string(),
            offset: 100,
        }];
        let b = vec![SearchMatch {
            snippet: "bbb".to_string(),
            offset: 100 + CONTEXT_PADDING + 1,
        }];
        let result = deduplicate_matches(a, b);
        assert_eq!(result.len(), 2);
    }
}
