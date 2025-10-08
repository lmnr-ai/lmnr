use std::sync::Arc;

use anyhow::Result;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::PROJECT_CACHE_KEY},
    db::{
        DB,
        project_settings::is_project_setting_enabled,
        projects::{ProjectWithWorkspaceBillingInfo, get_project_and_workspace_billing_info},
    },
};

#[derive(Debug, Clone)]
pub struct TraceEligibilityResult {
    pub is_eligible: bool,
    pub reason: Option<String>,
    #[allow(dead_code)]
    pub tier_name: Option<String>,
    #[allow(dead_code)]
    pub has_trace_analysis: bool,
}

pub async fn check_trace_eligibility(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<TraceEligibilityResult> {
    let cache_key = format!("{}:{}", PROJECT_CACHE_KEY, project_id);
    let project_info = cache
        .get::<ProjectWithWorkspaceBillingInfo>(&cache_key)
        .await;

    let tier_name = match project_info {
        Ok(Some(info)) => Some(info.tier_name),
        _ => {
            // Fallback: query database if not in cache
            match get_project_and_workspace_billing_info(&db.pool, &project_id).await {
                Ok(project) => Some(project.tier_name),
                Err(_) => {
                    return Ok(TraceEligibilityResult {
                        is_eligible: false,
                        reason: Some("project not found".to_string()),
                        tier_name: None,
                        has_trace_analysis: false,
                    });
                }
            }
        }
    };

    let is_paid_tier = tier_name
        .as_ref()
        .map(|name| name.trim().to_lowercase() != "free")
        .unwrap_or(false);

    if !is_paid_tier {
        return Ok(TraceEligibilityResult {
            is_eligible: false,
            reason: Some("workspace is on free tier".to_string()),
            tier_name,
            has_trace_analysis: false,
        });
    }

    let is_trace_analysis_enabled =
        is_project_setting_enabled(&db.pool, &project_id, "enable_trace_analysis").await?;

    if !is_trace_analysis_enabled {
        return Ok(TraceEligibilityResult {
            is_eligible: false,
            reason: Some("trace analysis not enabled in project settings".to_string()),
            tier_name,
            has_trace_analysis: false,
        });
    }

    Ok(TraceEligibilityResult {
        is_eligible: true,
        reason: None,
        tier_name,
        has_trace_analysis: true,
    })
}
