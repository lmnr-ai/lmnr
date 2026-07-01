use serde_json::json;
use uuid::Uuid;

use crate::notifications::utils::{frontend_url_slack, with_utm};

/// Format Slack message blocks for a usage warning notification.
/// Clean `:warning:` callout with a Manage billing button (links to the Stripe portal).
pub(super) fn format_usage_warning_blocks(
    workspace_id: Uuid,
    workspace_name: &str,
    usage_label: &str,
    formatted_limit: &str,
) -> serde_json::Value {
    let billing_link = with_utm(
        &format!(
            "{}/checkout/portal?workspaceId={}",
            frontend_url_slack(),
            workspace_id
        ),
        "slack",
        "usage_warning",
        "manage_billing",
    );
    json!([
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": format!(
                    ":warning: *{}* has reached *{}* of {}.",
                    workspace_name, formatted_limit, usage_label
                )
            },
            "accessory": {
                "type": "button",
                "text": { "type": "plain_text", "text": "Manage billing", "emoji": true },
                "url": billing_link,
                "action_id": "manage_billing",
                "style": "primary"
            }
        },
        {"type": "divider"}
    ])
}
