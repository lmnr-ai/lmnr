//! Markdown → email-safe HTML for agent-written cluster reports.
//!
//! Email clients drop `<style>` blocks unpredictably, so every element carries
//! inline styles. The Markdown comes from an LLM, so raw HTML is escaped as text
//! and only http(s)/mailto links become anchors.

use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};

use super::email::html_escape;

const TEXT: &str = "#252525";
const MUTED: &str = "#92949c";
const LINK: &str = "#d57e57";
const BORDER: &str = "#e5e5e5";
const CODE_BG: &str = "#f4f4f4";

pub(super) fn markdown_to_email_html(markdown: &str) -> String {
    let options = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH;
    let mut out = String::with_capacity(markdown.len() * 2);
    // Whether each open link was rendered as an anchor (unsafe schemes are not).
    let mut open_links: Vec<bool> = Vec::new();
    let mut in_table_head = false;

    for event in Parser::new_ext(markdown, options) {
        match event {
            Event::Start(tag) => match tag {
                Tag::Paragraph => out.push_str(&format!(
                    r#"<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:{TEXT}">"#
                )),
                Tag::Heading { level, .. } => out.push_str(&heading_open(level)),
                Tag::BlockQuote(_) => out.push_str(&format!(
                    r#"<blockquote style="margin:0 0 12px;padding-left:12px;border-left:3px solid {BORDER};color:{MUTED}">"#
                )),
                Tag::CodeBlock(_) => out.push_str(&format!(
                    r#"<pre style="margin:0 0 12px;padding:12px;background:{CODE_BG};border-radius:4px;font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:{TEXT}"><code>"#
                )),
                Tag::List(None) => out.push_str(
                    r#"<ul style="margin:0 0 12px;padding-left:20px">"#,
                ),
                Tag::List(Some(start)) => out.push_str(&format!(
                    r#"<ol start="{start}" style="margin:0 0 12px;padding-left:20px">"#
                )),
                Tag::Item => out.push_str(&format!(
                    r#"<li style="margin:0 0 4px;font-size:14px;line-height:1.5;color:{TEXT}">"#
                )),
                Tag::Table(_) => out.push_str(&format!(
                    r#"<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;margin:0 0 12px;font-size:13px;line-height:1.4;color:{TEXT}">"#
                )),
                Tag::TableHead => {
                    in_table_head = true;
                    out.push_str("<tr>");
                }
                Tag::TableRow => out.push_str("<tr>"),
                Tag::TableCell if in_table_head => out.push_str(&format!(
                    r#"<th align="left" style="padding:6px 8px;border-bottom:1px solid {BORDER};font-weight:500;color:{MUTED}">"#
                )),
                Tag::TableCell => out.push_str(&format!(
                    r#"<td valign="top" style="padding:6px 8px;border-bottom:1px solid {BORDER}">"#
                )),
                Tag::Emphasis => out.push_str("<em>"),
                Tag::Strong => out.push_str(r#"<strong style="font-weight:600">"#),
                Tag::Strikethrough => out.push_str("<s>"),
                Tag::Link { dest_url, .. } => {
                    let safe = is_safe_href(&dest_url);
                    if safe {
                        out.push_str(&format!(
                            r#"<a href="{}" style="color:{LINK};text-decoration:underline">"#,
                            html_escape(&dest_url)
                        ));
                    }
                    open_links.push(safe);
                }
                // Images, footnotes, definition lists, raw HTML blocks: keep their text only.
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Paragraph => out.push_str("</p>"),
                TagEnd::Heading(level) => out.push_str(&format!("</{}>", heading_tag(level))),
                TagEnd::BlockQuote(_) => out.push_str("</blockquote>"),
                TagEnd::CodeBlock => out.push_str("</code></pre>"),
                TagEnd::List(ordered) => out.push_str(if ordered { "</ol>" } else { "</ul>" }),
                TagEnd::Item => out.push_str("</li>"),
                TagEnd::Table => out.push_str("</table>"),
                TagEnd::TableHead => {
                    in_table_head = false;
                    out.push_str("</tr>");
                }
                TagEnd::TableRow => out.push_str("</tr>"),
                TagEnd::TableCell => out.push_str(if in_table_head { "</th>" } else { "</td>" }),
                TagEnd::Emphasis => out.push_str("</em>"),
                TagEnd::Strong => out.push_str("</strong>"),
                TagEnd::Strikethrough => out.push_str("</s>"),
                TagEnd::Link => {
                    if open_links.pop().unwrap_or(false) {
                        out.push_str("</a>");
                    }
                }
                _ => {}
            },
            Event::Text(text) | Event::Html(text) | Event::InlineHtml(text) => {
                out.push_str(&html_escape(&text))
            }
            Event::Code(code) => out.push_str(&format!(
                r#"<code style="font-family:Menlo,Consolas,monospace;font-size:12px;background:{CODE_BG};padding:1px 4px;border-radius:4px">{}</code>"#,
                html_escape(&code)
            )),
            Event::InlineMath(math) | Event::DisplayMath(math) => {
                out.push_str(&html_escape(&math))
            }
            Event::SoftBreak => out.push(' '),
            Event::HardBreak => out.push_str("<br>"),
            Event::Rule => out.push_str(&format!(
                r#"<hr style="border:0;border-top:1px solid {BORDER};margin:16px 0">"#
            )),
            Event::TaskListMarker(done) => out.push_str(if done { "☑ " } else { "☐ " }),
            Event::FootnoteReference(_) => {}
        }
    }
    out
}

fn heading_tag(level: HeadingLevel) -> &'static str {
    match level {
        HeadingLevel::H1 => "h1",
        HeadingLevel::H2 => "h2",
        HeadingLevel::H3 => "h3",
        HeadingLevel::H4 => "h4",
        HeadingLevel::H5 => "h5",
        HeadingLevel::H6 => "h6",
    }
}

fn heading_open(level: HeadingLevel) -> String {
    let size = match level {
        HeadingLevel::H1 | HeadingLevel::H2 => 16,
        _ => 14,
    };
    format!(
        r#"<{} style="margin:20px 0 8px;font-size:{size}px;font-weight:600;line-height:1.4;color:{TEXT}">"#,
        heading_tag(level)
    )
}

fn is_safe_href(url: &str) -> bool {
    let lower = url.trim_start().to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_report_sections_with_inline_styles() {
        let html = markdown_to_email_html(
            "## Overview\nThe agent **fails** to parse `args`.\n\n## Recommendation\n- Fix `parse()`\n- Add a test",
        );
        assert!(html.contains(r#"<h2 style="margin:20px 0 8px;font-size:16px"#));
        assert!(html.contains(">Overview</h2>"));
        assert!(html.contains(r#"<strong style="font-weight:600">fails</strong>"#));
        assert!(html.contains(">args</code>"));
        assert!(html.contains(r#"<ul style="margin:0 0 12px;padding-left:20px">"#));
        assert_eq!(html.matches("<li ").count(), 2);
        assert!(!html.contains("<style"));
    }

    #[test]
    fn renders_tables_with_header_cells() {
        let html = markdown_to_email_html(
            "| Trace | Date | What happened |\n|---|---|---|\n| [abc](https://laminar.sh/project/p/traces/t) | 2026-11-01 | It broke |",
        );
        assert!(html.contains("<table "));
        assert_eq!(html.matches("<th ").count(), 3);
        assert_eq!(html.matches("<td ").count(), 3);
        assert!(html.contains(r#"<a href="https://laminar.sh/project/p/traces/t""#));
        assert!(html.contains(">abc</a>"));
    }

    #[test]
    fn escapes_raw_html_and_drops_unsafe_links() {
        let html = markdown_to_email_html(
            "<script>alert(1)</script>\n\nSee [here](javascript:alert(1)) and <b>bold</b> & \"quotes\"",
        );
        assert!(!html.contains("<script"));
        assert!(html.contains("&lt;script&gt;"));
        assert!(html.contains("&lt;b&gt;bold&lt;/b&gt;"));
        assert!(!html.contains("javascript:"));
        assert!(html.contains("See here and"));
        assert!(html.contains("&amp; &quot;quotes&quot;"));
    }

    #[test]
    fn escapes_attribute_breakouts_in_hrefs() {
        let html = markdown_to_email_html(r#"[x](https://a.b/"onmouseover=alert(1))"#);
        assert!(!html.contains(r#""onmouseover"#));
    }
}
