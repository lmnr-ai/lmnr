use std::sync::LazyLock;

use regex::Regex;
use uuid::Uuid;

use super::NotificationKind;
use crate::reports::{ProjectReportData, ReportData};
use crate::utils::frontend_url_with_default;

/// Public-facing base URL for Slack message links. Defaults to `https://laminar.sh`
/// (short branded domain used in Slack messages on Laminar Cloud).
pub(super) fn frontend_url_slack() -> String {
    frontend_url_with_default("https://laminar.sh")
}

/// Public-facing base URL for email links. Defaults to `https://lmnr.ai`.
pub(super) fn frontend_url_email() -> String {
    frontend_url_with_default("https://lmnr.ai")
}

/// Append UTM tracking parameters to a notification URL.
///
/// Used so PostHog auto-captures `$utm_source`, `$utm_medium`, `$utm_campaign`,
/// and `$utm_content` on the resulting `$pageview`, enabling attribution funnels
/// and breakdowns for clicks originating from outbound notifications.
pub(super) fn with_utm(url: &str, source: &str, campaign: &str, content: &str) -> String {
    let sep = if url.contains('?') { '&' } else { '?' };
    format!(
        "{url}{sep}utm_source={source}&utm_medium=notification&utm_campaign={campaign}&utm_content={content}"
    )
}

/// Matches absolute URLs pointing to our product domains. Stops at characters
/// that commonly terminate URLs in markdown/plain text (whitespace, `)`, `]`,
/// `"`, `'`, `<`, `>`, or backticks) so we don't accidentally consume markdown
/// syntax or trailing punctuation-less text.
static LAMINAR_URL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"https?://(?:www\.)?(?:lmnr\.ai|laminar\.sh)/[^\s)\]"'<>`]*"#).unwrap()
});

/// Inject UTM tracking parameters into every Laminar/lmnr.ai URL found in `text`.
///
/// Used for content that contains LLM-rendered markdown links (e.g. signal event
/// descriptions with embedded span links). Safe to call on arbitrary text — if
/// no matching URLs are present the original string is returned unchanged.
/// Already-UTM-tagged URLs are left alone to avoid duplicate params.
pub(super) fn inject_utm_into_links(
    text: &str,
    source: &str,
    campaign: &str,
    content: &str,
) -> String {
    LAMINAR_URL_RE
        .replace_all(text, |caps: &regex::Captures| {
            let url = &caps[0];
            if url.contains("utm_source=") {
                url.to_string()
            } else {
                with_utm(url, source, campaign, content)
            }
        })
        .into_owned()
}

/// Matches markdown link syntax `[text](url)` plus any backticks around it
/// (LLMs often code-format span references), which are dropped. Link text may hold one level of
/// brackets (`[tool_call [finish]](url)`); URL may not contain whitespace or `)`.
static MARKDOWN_LINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"`*\[((?:[^\[\]]|\[[^\[\]]*\])+)\]\(([^)\s]+)\)`*").unwrap());

const CHIP_BG: &str = "#e2e2e2";
const CHIP_TEXT: &str = "#4a4a4a";
const CHIP_ARROW: &str = "#92949c";

/// HTML-escape a string for safe embedding in element content and attribute
/// values. Copied here to keep `utils.rs` self-contained.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Mirrors the frontend `LinkChip`. SVG icons are stripped by Gmail, so the
/// arrow is a text glyph; Outlook desktop drops the radius but keeps the fill.
fn link_chip(href: &str, label: &str) -> String {
    format!(
        r#"<a href="{href}" style="display:inline-block;background:{bg};border-radius:4px;padding:0 6px;color:{text};font-size:13px;line-height:20px;text-decoration:none;white-space:nowrap;vertical-align:baseline">{label}&nbsp;<span style="color:{arrow}">&#8599;</span></a>"#,
        href = html_escape(href),
        bg = CHIP_BG,
        text = CHIP_TEXT,
        arrow = CHIP_ARROW,
        label = html_escape(label),
    )
}

/// Render arbitrary text (which may contain markdown `[text](url)` links) as
/// safe HTML. Non-link text is HTML-escaped; Laminar links become chips and
/// other links plain `<a>` tags, with URL and text both escaped. Use in email
/// templates when the text comes from an LLM-authored event description.
pub(super) fn md_links_to_html_escaped(text: &str, link_color: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut last = 0;
    for caps in MARKDOWN_LINK_RE.captures_iter(text) {
        let m = caps.get(0).unwrap();
        out.push_str(&html_escape(&text[last..m.start()]));
        let link_text = &caps[1];
        let url = &caps[2];
        if LAMINAR_URL_RE.is_match(url) {
            out.push_str(&link_chip(url, link_text));
        } else {
            out.push_str(&format!(
                r#"<a href="{href}" style="color:{color};text-decoration:underline;">{label}</a>"#,
                href = html_escape(url),
                color = link_color,
                label = html_escape(link_text),
            ));
        }
        last = m.end();
    }
    out.push_str(&html_escape(&text[last..]));
    out
}

/// Reconstruct a `ReportData` (with title) from a batch of `SignalsReport` notifications.
/// Returns `None` if no `SignalsReport` entries are found.
pub(super) fn build_report_data_from_batch(
    notifications: &[NotificationKind],
    workspace_id: Uuid,
) -> Option<(String, ReportData)> {
    let mut report_data: Option<ReportData> = None;
    let mut title = String::new();

    for kind in notifications {
        if let NotificationKind::SignalsReport {
            workspace_name,
            project_id,
            project_name,
            title: t,
            period_label,
            period_start,
            period_end,
            signal_event_counts,
            signals,
        } = kind
        {
            let project_events: u64 = signal_event_counts.values().sum();
            let project = ProjectReportData {
                project_name: project_name.clone(),
                project_id: *project_id,
                signal_event_counts: signal_event_counts.clone(),
                signals: signals.clone(),
            };

            match report_data.as_mut() {
                None => {
                    title = t.clone();
                    report_data = Some(ReportData {
                        workspace_id,
                        workspace_name: workspace_name.clone(),
                        period_label: period_label.clone(),
                        period_start: period_start.clone(),
                        period_end: period_end.clone(),
                        projects: vec![project],
                        total_events: project_events,
                    });
                }
                Some(existing) => {
                    existing.projects.push(project);
                    existing.total_events += project_events;
                }
            }
        }
    }

    report_data.map(|data| (title, data))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SPAN_URL: &str = "https://lmnr.ai/project/p/traces/t?spanId=s&chat=true";

    #[test]
    fn link_text_with_nested_brackets_becomes_a_chip() {
        let html = md_links_to_html_escaped(
            &format!(
                "decision was `[tool_call [complete_without_response]]({SPAN_URL})` with args"
            ),
            "#000",
        );
        assert!(html.starts_with("decision was <a href="), "{html}");
        assert!(
            html.contains(">tool_call [complete_without_response]&nbsp;"),
            "{html}"
        );
        assert!(html.ends_with("</a> with args"), "{html}");
        assert!(!html.contains('`'), "{html}");
    }

    #[test]
    fn stray_backticks_are_dropped_and_external_links_stay_plain() {
        let html = md_links_to_html_escaped(
            &format!("`[a]({SPAN_URL}) and [docs](https://example.com)"),
            "#000",
        );
        assert!(html.starts_with("<a href="), "{html}");
        assert!(
            html.contains(r#"<a href="https://example.com" style="color:#000;"#),
            "{html}"
        );
    }
}
