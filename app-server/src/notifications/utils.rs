use std::sync::LazyLock;

use regex::Regex;
use uuid::Uuid;

use super::NotificationKind;
use crate::reports::email_template::{ProjectReportData, ReportData};

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

/// Matches markdown link syntax `[text](url)`. Link text may not contain `]`;
/// URL may not contain whitespace or `)`.
static MARKDOWN_LINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[([^\]]+)\]\(([^)\s]+)\)").unwrap());

/// HTML-escape a string for safe embedding in element content and attribute
/// values. Copied here to keep `utils.rs` self-contained.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Render arbitrary text (which may contain markdown `[text](url)` links) as
/// safe HTML. Non-link text is HTML-escaped; markdown links are converted into
/// `<a href="...">text</a>` with the link URL and text both escaped. Use in
/// email templates when the text comes from an LLM-authored event description.
pub(super) fn md_links_to_html_escaped(text: &str, link_color: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut last = 0;
    for caps in MARKDOWN_LINK_RE.captures_iter(text) {
        let m = caps.get(0).unwrap();
        out.push_str(&html_escape(&text[last..m.start()]));
        let link_text = &caps[1];
        let url = &caps[2];
        out.push_str(&format!(
            r#"<a href="{href}" style="color:{color};text-decoration:underline;">{label}</a>"#,
            href = html_escape(url),
            color = link_color,
            label = html_escape(link_text),
        ));
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
            ai_summary,
            noteworthy_events,
        } = kind
        {
            let project_events: u64 = signal_event_counts.values().sum();
            let project = ProjectReportData {
                project_name: project_name.clone(),
                project_id: *project_id,
                signal_event_counts: signal_event_counts.clone(),
                ai_summary: ai_summary.clone(),
                noteworthy_events: noteworthy_events.clone(),
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
