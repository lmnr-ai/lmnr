//! Email formatting for all notification types.
//!
//! This module is responsible for rendering HTML emails on the consumer side,
//! based on the structured `NotificationKind` data. When a delivery message
//! contains multiple notifications (e.g. a report with per-project entries),
//! they are combined into a single email.

use uuid::Uuid;

use super::NotificationKind;
use super::utils::{
    build_report_data_from_batch, frontend_url_email, inject_utm_into_links,
    md_links_to_html_escaped, with_utm,
};
use crate::reports::ReportData;

const REPORT_FROM_EMAIL: &str = "Laminar <reports@mail.lmnr.ai>";
const ALERT_FROM_EMAIL: &str = "Laminar <alerts@mail.lmnr.ai>";
const USAGE_WARNING_FROM_EMAIL: &str = "Laminar <usage@mail.lmnr.ai>";

#[derive(Default)]
pub struct EmailContent {
    pub from: String,
    pub subject: String,
    pub html: String,
}

const LAMINAR_LOGO_CID: &str = "laminar-logo";
/// Primary brand color (#D0754E)
const PRIMARY_200: &str = "#da875f";
const PRIMARY_300: &str = "#d57e57";
const PAGE: &str = "#f4f4f4";
const SURFACE_50: &str = "#0d0d0d";
const TEXT: &str = "#252525";
const MUTED: &str = "#92949c";
const ROW: &str = "#f7f7f7";

fn email_document(title: &str, width: u16, body: &str) -> String {
    format!(
        r#"<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{}</title><style>@media(max-width:720px){{.email-shell{{padding-left:0!important;padding-right:0!important}}}}.email-view-button:hover{{background:#e0e0e0!important}}.email-cluster-view-button:hover{{background:rgba(0,0,0,.12)!important}}u+.email-body .gmail-blend-screen{{background:#000;mix-blend-mode:screen}}u+.email-body .gmail-blend-difference{{background:#000;mix-blend-mode:difference}}</style></head><body class="email-body" style="margin:0;background:{};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;"><div class="email-shell" style="max-width:{}px;margin:0 auto;padding:20px;">{}</div></body></html>"#,
        html_escape(title),
        PAGE,
        width,
        body
    )
}

fn banner(workspace: &str, title: &str, subtitle: Option<&str>) -> String {
    let (height, bottom) = if subtitle.is_some() {
        (200, 16)
    } else {
        (160, 12)
    };
    let subtitle_html = subtitle
        .map(|s| {
            format!(
                r#"<div class="gmail-blend-screen"><div class="gmail-blend-difference"><p style="margin:0;font-size:14px;font-weight:400;color:#bfc1c7;">{}</p></div></div>"#,
                html_escape(s)
            )
        })
        .unwrap_or_default();
    format!(
        r#"<div style="background:#252525;background-image:linear-gradient(#252525,#252525);border-radius:8px;margin-bottom:4px"><table width="100%" height="{height}" cellpadding="0" cellspacing="0" role="presentation" style="height:{height}px"><tr height="{half}"><td valign="top" style="padding:16px 20px 0"><table cellpadding="0" cellspacing="0" role="presentation"><tr height="15"><td width="76" height="15" style="line-height:0"><img src="cid:{cid}" alt="Laminar" width="76" height="13" style="display:block;border:0"></td><td width="8"></td><td style="font-size:14px;font-weight:400;color:#bfc1c7"><div class="gmail-blend-screen"><div class="gmail-blend-difference">/</div></div></td><td width="8"></td><td style="font-size:14px;font-weight:400;color:#bfc1c7"><div class="gmail-blend-screen"><div class="gmail-blend-difference">{workspace}</div></div></td></tr></table></td></tr><tr height="{half}"><td valign="bottom" style="padding:0 20px {bottom}px"><div class="gmail-blend-screen"><div class="gmail-blend-difference"><p style="margin:0 0 2px;font-size:28px;font-weight:400;color:#fff;letter-spacing:-.56px">{title}</p></div></div>{subtitle_html}</td></tr></table></div>"#,
        height = height,
        half = height / 2,
        bottom = bottom,
        cid = LAMINAR_LOGO_CID,
        workspace = html_escape(workspace),
        title = html_escape(title),
        subtitle_html = subtitle_html
    )
}

fn footer(message: &str, link: &str, label: &str) -> String {
    format!(
        r#"<div style="text-align:center;padding:16px 0;font-size:12px;color:#92949c;line-height:1.6"><p style="margin:0 0 4px">{}</p><p style="margin:0"><a href="{}" style="color:#92949c">{}</a></p></div>"#,
        message, link, label
    )
}

fn action(href: &str, label: &str) -> String {
    format!(
        r#"<div style="margin-top:20px;text-align:center"><a href="{}" style="display:inline-block;background:{};color:{};text-decoration:none;padding:10px 16px;border-radius:4px;font-size:14px;font-weight:400">{}</a></div>"#,
        href,
        PRIMARY_200,
        SURFACE_50,
        html_escape(label)
    )
}

fn breadcrumb(parts: &[&str], href: &str) -> String {
    let last = parts.len().saturating_sub(1);
    let text = parts
        .iter()
        .enumerate()
        .map(|(index, part)| {
            let color = if index == last { TEXT } else { MUTED };
            format!(
                r#"<span style="color:{color}">{}</span>"#,
                html_escape(part)
            )
        })
        .collect::<Vec<_>>()
        .join(r#"<span style="display:inline-block;margin:0 10px;color:#92949c">/</span>"#);
    format!(
        r#"<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td style="font-size:14px;font-weight:400">{}</td><td width="54" align="right" valign="top"><a class="email-view-button" href="{}" style="display:inline-block;background:#ebebeb;border-radius:999px;color:#252525;font-size:12px;line-height:16px;padding:4px 10px;text-decoration:none;white-space:nowrap">View&nbsp;›</a></td></tr></table>"#,
        text, href
    )
}

fn data_rows(rows: &[(String, String)]) -> String {
    rows.iter().map(|(label, value)| format!(r#"<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:{};border-radius:4px;margin-bottom:4px"><tr><td style="padding:7px 10px;font-size:14px;color:{}">{}</td><td align="right" style="padding:7px 10px;font-size:14px;color:{}">{}</td></tr></table>"#, ROW, MUTED, html_escape(label), TEXT, value)).collect()
}

/// Format an email for a batch of notifications.
///
/// All notifications in the batch are expected to be of the same kind.
/// Reports are rendered by combining per-project data into a single email.
/// Alerts and usage warnings use the first (and only) notification.
pub fn format_email_batch(notifications: &[NotificationKind], workspace_id: &Uuid) -> EmailContent {
    let Some(first) = notifications.first() else {
        return EmailContent::default();
    };

    match first {
        NotificationKind::EventIdentification {
            project_id,
            project_name,
            signal_id,
            trace_id,
            event_name,
            severity,
            extracted_information,
            alert_name,
            event_id,
        } => {
            let trace_link = with_utm(
                &format!(
                    "{}/project/{}/traces/{}?chat=true",
                    frontend_url_email(),
                    project_id,
                    trace_id
                ),
                "email",
                "signal_alert",
                "view_trace",
            );
            let attributes = extracted_information
                .clone()
                .unwrap_or(serde_json::Value::Object(Default::default()));
            let severity_label = severity_label(*severity);
            let subject = if project_name.is_empty() {
                format!("{}: {} event", event_name, severity_label)
            } else {
                format!(
                    "[{}] {}: {} event",
                    project_name, event_name, severity_label
                )
            };
            EmailContent {
                from: ALERT_FROM_EMAIL.to_string(),
                subject,
                html: render_alert_email(
                    event_name,
                    project_name,
                    &attributes,
                    &trace_link,
                    project_id,
                    signal_id,
                    *severity,
                    alert_name,
                    event_id.as_ref(),
                ),
            }
        }
        NotificationKind::NewCluster { signal_name, .. } => {
            // All clusters in the batch are rendered as one digest email.
            let clusters: Vec<&NotificationKind> = notifications
                .iter()
                .filter(|n| matches!(n, NotificationKind::NewCluster { .. }))
                .collect();
            let subject = if clusters.len() > 1 {
                format!("{}: {} new clusters", signal_name, clusters.len())
            } else {
                format!("{}: New cluster", signal_name)
            };
            EmailContent {
                from: ALERT_FROM_EMAIL.to_string(),
                subject,
                html: render_new_cluster_email(&clusters),
            }
        }
        NotificationKind::SignalsReport { .. } => {
            let (title, report_data) = build_report_data_from_batch(notifications, *workspace_id)
                .expect("SignalsReport batch must contain at least one report");
            EmailContent {
                from: REPORT_FROM_EMAIL.to_string(),
                subject: title,
                html: render_report_email(&report_data),
            }
        }
        NotificationKind::UsageWarning {
            workspace_name,
            usage_label,
            formatted_limit,
            usage_item,
            at_tier_included_allowance,
            tier_display_name,
            overage_billable,
        } => EmailContent {
            from: USAGE_WARNING_FROM_EMAIL.to_string(),
            subject: format!(
                "Usage warning: {} reached {} \u{2013} {}",
                usage_label, formatted_limit, workspace_name
            ),
            html: render_usage_warning_email(
                workspace_name,
                *workspace_id,
                usage_item,
                formatted_limit,
                usage_label,
                *at_tier_included_allowance,
                tier_display_name,
                *overage_billable,
            ),
        },
        NotificationKind::UsageHardLimit {
            workspace_name,
            usage_label,
            formatted_limit,
            usage_item,
        } => EmailContent {
            from: USAGE_WARNING_FROM_EMAIL.to_string(),
            subject: format!(
                "Usage limit reached: {} \u{2013} {}",
                usage_label, workspace_name
            ),
            html: render_usage_hard_limit_email(
                workspace_name,
                *workspace_id,
                usage_item,
                formatted_limit,
                usage_label,
            ),
        },
    }
}

// ── Alert email ──

/// Human-readable severity label for an alert notification severity level.
fn severity_label(severity: u8) -> &'static str {
    match severity {
        0 => "Info",
        1 => "Warning",
        2 => "Critical",
        _ => "Unknown",
    }
}

/// Render an HTML email for an alert notification.
fn render_alert_email(
    event_name: &str,
    project_name: &str,
    attributes: &serde_json::Value,
    trace_link: &str,
    project_id: &Uuid,
    signal_id: &Uuid,
    severity: u8,
    _alert_name: &str,
    _event_id: Option<&Uuid>,
) -> String {
    let mut rows = vec![("Severity".to_string(), severity_label(severity).to_string())];
    if let Some(object) = attributes.as_object() {
        rows.extend(object.iter().map(|(key, value)| {
            let value = value
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| value.to_string());
            (
                key.clone(),
                md_links_to_html_escaped(
                    &inject_utm_into_links(&value, "email", "signal_alert", "event_description"),
                    PRIMARY_300,
                ),
            )
        }));
    }
    let manage = with_utm(
        &format!(
            "{}/project/{}/settings?tab=alerts",
            frontend_url_email(),
            project_id
        ),
        "email",
        "signal_alert",
        "manage_preferences",
    );
    let signal_link = format!(
        "{}/project/{}/signals/{}",
        frontend_url_email(),
        project_id,
        signal_id
    );
    let card = format!(
        r#"<div style="background:#fff;border-radius:8px;padding:20px;margin-bottom:4px">{}<p style="margin:16px 0 20px;font-size:14px;line-height:1.5;color:{}">A new signal event requires your attention.</p>{}{}</div>"#,
        breadcrumb(&[project_name, event_name], &signal_link),
        TEXT,
        data_rows(&rows),
        action(trace_link, "View trace")
    );
    let body = format!(
        "{}{}{}",
        banner(
            project_name,
            &format!("{} signal event", severity_label(severity)),
            None
        ),
        card,
        footer(
            "This alert was generated automatically by Laminar.",
            &manage,
            "Manage alert preferences"
        )
    );
    email_document(
        &format!("{}: {} event", event_name, severity_label(severity)),
        680,
        &body,
    )
}

/// Render one cluster's section inside the new-cluster digest email.
fn render_new_cluster_section(kind: &NotificationKind, base: &str) -> String {
    let NotificationKind::NewCluster {
        project_id,
        project_name,
        signal_id,
        signal_name,
        cluster_id,
        cluster_name,
        num_signal_events,
        last_seen,
        severity_counts,
        ..
    } = kind
    else {
        return String::new();
    };
    let cluster_link = with_utm(
        &format!(
            "{}/project/{}/signals/{}?clusterId={}",
            base, project_id, signal_id, cluster_id
        ),
        "email",
        "new_cluster_alert",
        "view_cluster",
    );
    let rows = vec![
        (
            "Critical".to_string(),
            format!("{} events", severity_counts[2]),
        ),
        (
            "Warning".to_string(),
            format!("{} events", severity_counts[1]),
        ),
        ("Info".to_string(), format!("{} events", severity_counts[0])),
        ("Total".to_string(), format!("{} events", num_signal_events)),
        (
            "Last seen".to_string(),
            last_seen
                .clone()
                .unwrap_or_else(|| "Not available".to_string()),
        ),
    ];
    format!(
        r#"<div style="background:#fff;border-radius:8px;padding:20px;margin-bottom:4px">{}<p style="margin:16px 0 20px;font-size:14px;line-height:1.5;color:{}">A new group of related signal events has emerged.</p>{}{}</div>"#,
        breadcrumb(&[project_name, signal_name, cluster_name], &cluster_link),
        TEXT,
        data_rows(&rows),
        action(&cluster_link, "View cluster")
    )
}

/// Render an HTML digest email covering every new cluster in the batch.
fn render_new_cluster_email(clusters: &[&NotificationKind]) -> String {
    let Some(NotificationKind::NewCluster {
        project_name,
        signal_name,
        project_id,
        ..
    }) = clusters.first()
    else {
        return String::new();
    };
    let base = frontend_url_email();
    let cards = clusters
        .iter()
        .map(|kind| render_new_cluster_section(kind, &base))
        .collect::<String>();
    let manage = with_utm(
        &format!("{}/project/{}/settings?tab=alerts", base, project_id),
        "email",
        "new_cluster_alert",
        "manage_preferences",
    );
    let title = if clusters.len() == 1 {
        "New cluster detected".to_string()
    } else {
        format!("{} new clusters detected", clusters.len())
    };
    let body = format!(
        "{}{}{}",
        banner(project_name, &title, None),
        cards,
        footer(
            &format!("New-cluster notification for {}.", html_escape(signal_name)),
            &manage,
            "Manage alert preferences"
        )
    );
    email_document(&format!("{}: New cluster", signal_name), 680, &body)
}

/// Render an HTML email for a usage warning notification.
#[allow(clippy::too_many_arguments)]
fn render_usage_warning_email(
    workspace_name: &str,
    workspace_id: Uuid,
    usage_item: &str,
    formatted_limit: &str,
    usage_label: &str,
    at_tier_included_allowance: bool,
    tier_display_name: &str,
    overage_billable: bool,
) -> String {
    let meter = match usage_item {
        "bytes" => "data ingestion",
        "signal_cost" => "Signals usage",
        _ => "usage",
    };
    let copy = if at_tier_included_allowance && overage_billable {
        format!(
            "Your workspace has used all {} included in the {} plan for this billing cycle. Additional usage is now billed at the overage rate.",
            meter, tier_display_name
        )
    } else {
        format!(
            "Your workspace has reached {} of {} in the current billing cycle.",
            formatted_limit, meter
        )
    };
    let link = with_utm(
        &format!(
            "{}/workspace/{}?tab=usage",
            frontend_url_email(),
            workspace_id
        ),
        "email",
        "usage_warning",
        "view_usage",
    );
    let rows = vec![
        ("Threshold".to_string(), html_escape(formatted_limit)),
        ("Usage".to_string(), html_escape(usage_label)),
        ("Plan".to_string(), html_escape(tier_display_name)),
    ];
    let card = format!(
        r#"<div style="background:#fff;border-radius:8px;padding:20px;margin-bottom:4px"><p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:{}">{}</p>{}{}</div>"#,
        TEXT,
        html_escape(&copy),
        data_rows(&rows),
        action(&link, "View usage")
    );
    let body = format!(
        "{}{}{}",
        banner(workspace_name, "Usage warning", None),
        card,
        footer(
            "This notification was generated automatically by Laminar.",
            &link,
            "Manage warning thresholds"
        )
    );
    email_document(&format!("Usage Warning – {}", workspace_name), 544, &body)
}

/// Render an HTML email for a usage hard-limit notification.
fn render_usage_hard_limit_email(
    workspace_name: &str,
    workspace_id: Uuid,
    usage_item: &str,
    formatted_limit: &str,
    usage_label: &str,
) -> String {
    let (blocked, meter) = match usage_item {
        "bytes" => ("Data ingestion", "data ingested"),
        "signal_cost" => ("Signal runs", "signals cost"),
        _ => ("Usage", "usage"),
    };
    let link = with_utm(
        &format!(
            "{}/workspace/{}?tab=usage",
            frontend_url_email(),
            workspace_id
        ),
        "email",
        "usage_hard_limit",
        "manage_limits",
    );
    let copy = format!(
        "Your workspace reached its hard limit. New {} will stop until the billing cycle resets or the limit is changed.",
        meter
    );
    let rows = vec![
        ("Hard limit".to_string(), html_escape(formatted_limit)),
        ("Usage".to_string(), html_escape(usage_label)),
        ("Status".to_string(), "Paused".to_string()),
    ];
    let card = format!(
        r#"<div style="background:#fff;border-radius:8px;padding:20px;margin-bottom:4px"><p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:{}">{}</p>{}{}</div>"#,
        TEXT,
        html_escape(&copy),
        data_rows(&rows),
        action(&link, "Manage limit")
    );
    let subtitle = format!("{} has paused", blocked);
    let body = format!(
        "{}{}{}",
        banner(workspace_name, "Usage limit reached", Some(&subtitle)),
        card,
        footer(
            "This notification was generated automatically by Laminar.",
            &link,
            "Manage usage limits"
        )
    );
    email_document(
        &format!("Usage Limit Reached – {}", workspace_name),
        544,
        &body,
    )
}

/// Render an HTML email for a signals report notification.
fn render_report_email(data: &ReportData) -> String {
    let base = frontend_url_email();
    let mut cards = String::new();
    for project in &data.projects {
        for signal in &project.signals {
            cards.push_str(&render_signal_card(project, signal, &base));
        }
    }
    let cards = if cards.is_empty() {
        r#"<div style="background:#fff;border-radius:8px;padding:24px;text-align:center;color:#92949c">No signal activity in this period.</div>"#.to_string()
    } else {
        cards
    };
    let unsubscribe = with_utm(
        &format!("{}/workspace/{}?tab=reports", base, data.workspace_id),
        "email",
        "signals_report",
        "unsubscribe",
    );
    let subtitle = format!("{} - {}", data.period_start, data.period_end);
    let body = format!(
        "{}{}{}",
        banner(&data.workspace_name, "Signals Report", Some(&subtitle)),
        cards,
        footer(
            &format!(
                "This report was generated automatically for the {} workspace.",
                html_escape(&data.workspace_name)
            ),
            &unsubscribe,
            "Unsubscribe"
        )
    );
    email_document(
        &format!("Signals Report – {}", data.workspace_name),
        680,
        &body,
    )
}

fn render_signal_card(
    project: &crate::reports::ProjectReportData,
    signal: &crate::reports::SignalReportData,
    base: &str,
) -> String {
    let signal_link = with_utm(
        &format!(
            "{}/project/{}/signals/{}",
            base, project.project_id, signal.signal_id
        ),
        "email",
        "signals_report",
        "view_signal",
    );
    let mut clusters: Vec<_> = signal
        .clusters
        .iter()
        .filter(|row| row.count + row.previous_count >= 5)
        .collect();
    clusters.sort_by(
        |a, b| match (a.previous_count == 0, b.previous_count == 0) {
            (true, false) => std::cmp::Ordering::Greater,
            (false, true) => std::cmp::Ordering::Less,
            _ => cluster_score(b)
                .partial_cmp(&cluster_score(a))
                .unwrap_or(std::cmp::Ordering::Equal),
        },
    );
    clusters.truncate(5);
    let max_count = clusters
        .iter()
        .map(|row| row.count)
        .max()
        .unwrap_or(1)
        .max(1);
    let clusters_html = if clusters.is_empty() {
        r#"<p style="margin:0;color:#92949c;font-size:14px">No notable clusters in this period.</p>"#.to_string()
    } else {
        clusters
            .into_iter()
            .map(|row| cluster_row(project.project_id, signal.signal_id, row, max_count, base))
            .collect()
    };
    let summary = if signal.summary.is_empty() {
        format!(
            "{} events were detected during this period.",
            signal.current_count
        )
    } else {
        signal.summary.clone()
    };
    format!(
        r#"<div style="background:#fff;border-radius:8px;padding:16px 20px;margin-bottom:4px">{}<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:{}">{}</p><div style="margin-top:24px"><p style="margin:0 0 4px;font-size:14px;color:{}">Events</p><table cellpadding="0" cellspacing="0"><tr><td valign="baseline" style="font-size:30px;line-height:30px;color:{};padding-right:6px">{}</td><td valign="baseline" style="white-space:nowrap">{} <span style="font-size:12px;color:#92949c">vs previous period</span></td></tr></table><div style="margin-top:12px">{}</div></div><div style="margin-top:24px"><p style="margin:0 0 12px;font-size:14px;color:{}">Notable clusters</p>{}</div></div>"#,
        breadcrumb(&[&project.project_name, &signal.signal_name], &signal_link),
        TEXT,
        html_escape(&summary),
        TEXT,
        TEXT,
        signal.current_count,
        delta(signal.current_count, signal.previous_count),
        chart(&signal.buckets),
        TEXT,
        clusters_html
    )
}

fn cluster_score(row: &&crate::reports::ReportClusterData) -> f64 {
    ((row.count as f64 - row.previous_count as f64)
        / ((row.count + row.previous_count) as f64).sqrt())
    .abs()
}

fn delta(current: u64, previous: u64) -> String {
    if previous == 0 {
        return r#"<span style="font-size:14px;color:#92949c">NEW</span>"#.to_string();
    }
    let pct = (current as f64 - previous as f64) / previous as f64 * 100.0;
    if pct == 0.0 {
        return r#"<span style="font-size:14px;color:#92949c">0.0%</span>"#.to_string();
    }
    let (glyph, color) = if pct > 0.0 {
        ("&#9650;", "#e05252")
    } else {
        ("&#9660;", "#2f9e67")
    };
    format!(
        r#"<span style="font-size:12px;color:{color}">{glyph}</span><span style="display:inline-block;width:2px">&nbsp;</span><span style="font-size:14px;color:{color}">{:.1}%</span>"#,
        pct.abs()
    )
}

fn chart(buckets: &[crate::reports::ReportChartBucket]) -> String {
    let max = buckets.iter().map(|b| b.value).max().unwrap_or(0);
    let scale = max.max(1);
    let cells: String = buckets.iter().map(|b| { let height = if b.value == 0 { 0 } else { ((b.value * 96 / scale).max(2)) as u32 }; format!(r#"<td valign="bottom" style="padding:0 2px"><div style="height:{}px;line-height:{}px;font-size:0">&nbsp;</div><div style="height:{}px;line-height:{}px;font-size:0;background:#ebebeb;border-radius:2px 2px 0 0">&nbsp;</div></td>"#, 96-height, 96-height, height, height) }).collect();
    let first = buckets.first().map(|b| b.label.as_str()).unwrap_or("");
    let middle = buckets
        .get(buckets.len().saturating_sub(1) / 2)
        .map(|b| b.label.as_str())
        .unwrap_or("");
    let last = buckets.last().map(|b| b.label.as_str()).unwrap_or("");
    format!(
        r#"<table width="100%" cellpadding="0" cellspacing="0"><tr><td width="28" valign="top" align="right" style="padding-right:8px;font-size:11px;color:#b1b1b1">{max}</td><td><table width="100%" height="96" cellpadding="0" cellspacing="0" style="height:96px;border-bottom:1px solid #e5e5e5"><tr valign="bottom">{cells}</tr></table></td></tr><tr><td align="right" style="padding:2px 8px 0 0;font-size:11px;color:#b1b1b1">0</td><td style="padding-top:4px"><table width="100%"><tr><td style="font-size:11px;color:#b1b1b1">{first}</td><td align="center" style="font-size:11px;color:#b1b1b1">{middle}</td><td align="right" style="font-size:11px;color:#b1b1b1">{last}</td></tr></table></td></tr></table>"#,
        first = html_escape(first),
        middle = html_escape(middle),
        last = html_escape(last)
    )
}

fn cluster_row(
    project_id: Uuid,
    signal_id: Uuid,
    row: &crate::reports::ReportClusterData,
    max: u64,
    base: &str,
) -> String {
    let href = with_utm(
        &format!(
            "{}/project/{}/signals/{}?clusterId={}",
            base, project_id, signal_id, row.id
        ),
        "email",
        "signals_report",
        "view_cluster",
    );
    let width = row.count * 100 / max;
    let accent = CLUSTER_PALETTE[cluster_color_index(&row.id.to_string())];
    let tint = cluster_tint_rgba(accent);
    format!(
        r#"<table class="email-cluster-row" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;background-color:#f7f7f7;background-image:linear-gradient(to right,{tint} 0%,{tint} {width}%,transparent {width}%);border-radius:16px"><tr><td style="padding:6px 12px 6px 10px;font-size:14px;color:#252525"><span aria-hidden="true" style="display:inline-block;color:{accent};font-family:Arial,sans-serif;font-size:20px;font-weight:400;line-height:20px;vertical-align:middle">◇</span>&nbsp;&nbsp;{name}</td><td align="right" style="padding:6px 4px;font-size:14px;color:#92949c">{count} events</td><td width="80" align="right" style="padding:6px 4px">{delta}</td><td width="54" align="right" style="padding:3px 4px 3px 8px"><a class="email-view-button email-cluster-view-button" href="{href}" style="display:inline-block;background:#ebebeb;background:rgba(0,0,0,.08);border-radius:999px;color:#252525;font-size:12px;line-height:16px;padding:4px 10px;text-decoration:none;white-space:nowrap">View&nbsp;›</a></td></tr></table>"#,
        name = html_escape(&row.name),
        count = row.count,
        delta = delta(row.count, row.previous_count)
    )
}

const CLUSTER_PALETTE: [&str; 100] = [
    "#ef4444", "#f0493c", "#f24f35", "#f4572d", "#f55f25", "#f7691d", "#f97416", "#f87b14",
    "#f88212", "#f78910", "#f6910e", "#f6980c", "#f59f0a", "#f3a30a", "#f1a609", "#efaa09",
    "#edad09", "#ebb108", "#e8ba09", "#e3ce0b", "#dbde0e", "#c0d910", "#a7d413", "#90cf15",
    "#76cb17", "#59ca19", "#3dc91b", "#22c81d", "#1fc736", "#21c652", "#20c461", "#1dc267",
    "#1ac06d", "#17be73", "#14bc79", "#11ba7f", "#10b986", "#11b98c", "#12b992", "#13b899",
    "#13b89f", "#14b8a5", "#12bcaf", "#10c0bb", "#0ec3c5", "#0bbfca", "#09bbcf", "#06b6d4",
    "#07b4d7", "#08b1db", "#0aaedf", "#0babe2", "#0da8e6", "#0ea5ea", "#109ff1", "#1997f2",
    "#2291f3", "#2b8bf4", "#3486f5", "#3c81f6", "#437af5", "#4a74f4", "#516ff3", "#586bf2",
    "#5e68f1", "#6363f1", "#6961f2", "#7060f3", "#775ff4", "#7f5ef5", "#865df5", "#8d5cf6",
    "#925af6", "#9659f6", "#9b58f7", "#a057f7", "#a656f7", "#ac54f6", "#b451f5", "#bd4ef4",
    "#c54cf2", "#cd49f1", "#d647f0", "#e546ef", "#ee47e6", "#ee47d4", "#ed47c1", "#ed48af",
    "#ec489d", "#ed4792", "#ee4588", "#f0447f", "#f14275", "#f2416a", "#f43f5f", "#f3405a",
    "#f24155", "#f24151", "#f1424c", "#f04348",
];
fn cluster_hash(id: &str) -> u32 {
    format!("v4{}", id)
        .bytes()
        .fold(2_166_136_261u32, |hash, byte| {
            (hash ^ byte as u32).wrapping_mul(16_777_619)
        })
}
fn cluster_color_index(id: &str) -> usize {
    cluster_hash(id) as usize % CLUSTER_PALETTE.len()
}

fn cluster_tint_rgba(color: &str) -> String {
    let component = |range| u8::from_str_radix(&color[range], 16).unwrap_or(0);
    format!(
        "rgba({},{},{},.08)",
        component(1..3),
        component(3..5),
        component(5..7)
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::reports::{
        ProjectReportData, ReportChartBucket, ReportClusterData, ReportData, SignalReportData,
    };
    use std::collections::BTreeMap;

    #[test]
    fn cluster_color_matches_frontend_golden_vectors() {
        let vectors = [
            ("abc", 2_654_589_193, "#f2416a"),
            (
                "550e8400-e29b-41d4-a716-446655440000",
                843_809_330,
                "#20c461",
            ),
            (
                "7f3a1c22-0000-4000-8000-000000000001",
                2_838_285_401,
                "#f0493c",
            ),
        ];
        for (id, hash, color) in vectors {
            assert_eq!(cluster_hash(id), hash);
            assert_eq!(CLUSTER_PALETTE[cluster_color_index(id)], color);
        }
    }

    #[test]
    fn ranks_existing_clusters_before_new_and_filters_small_rows() {
        let id = |n| Uuid::from_u128(n);
        let signal = SignalReportData {
            signal_id: id(1),
            signal_name: "Signal".into(),
            current_count: 12,
            previous_count: 10,
            summary: "Summary".into(),
            buckets: vec![ReportChartBucket {
                label: "Mar 1".into(),
                value: 12,
            }],
            clusters: vec![
                ReportClusterData {
                    id: id(2),
                    name: "new".into(),
                    count: 100,
                    previous_count: 0,
                },
                ReportClusterData {
                    id: id(3),
                    name: "existing".into(),
                    count: 2,
                    previous_count: 10,
                },
                ReportClusterData {
                    id: id(4),
                    name: "small".into(),
                    count: 2,
                    previous_count: 2,
                },
            ],
        };
        let project = ProjectReportData {
            project_name: "Project".into(),
            project_id: id(5),
            signal_event_counts: BTreeMap::new(),
            signals: vec![],
            ai_summary: String::new(),
            noteworthy_events: vec![],
        };
        let html = render_signal_card(&project, &signal, "https://example.com");
        assert!(html.find("existing").unwrap() < html.find("new").unwrap());
        assert!(!html.contains("small"));
        assert!(html.contains("height:96px"));
        assert!(html.contains("border-radius:16px"));
        assert!(html.contains(r#"<span style="color:#92949c">Project</span>"#));
        assert!(html.contains(r#"<span style="color:#252525">Signal</span>"#));
        assert!(html.contains(r#"<td valign="baseline" style="white-space:nowrap">"#));
    }

    #[test]
    fn report_uses_fixed_banner_and_email_safe_markup() {
        let report = ReportData {
            workspace_id: Uuid::nil(),
            workspace_name: "A & B".into(),
            period_label: "Weekly".into(),
            period_start: "Mar 1".into(),
            period_end: "Mar 7".into(),
            projects: vec![],
            total_events: 0,
        };
        let html = render_report_email(&report);
        assert!(html.contains("height:200px"));
        assert!(html.contains("cid:laminar-logo"));
        assert!(html.contains("background-image:linear-gradient(#252525,#252525)"));
        assert!(html.contains("gmail-blend-screen"));
        assert!(!html.contains("font-size:16px"));
        assert!(!html.contains("<svg"));
        assert!(!html.contains("data:image"));
        assert!(html.contains("A &amp; B"));
    }
}
