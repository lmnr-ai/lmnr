use std::sync::Arc;

use anyhow::Result;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::PROJECT_CACHE_KEY},
    db::{DB, project_settings::is_project_setting_enabled, projects::get_project_and_workspace_billing_info},
};

#[derive(Debug, Clone)]
pub struct TraceEligibilityResult {
    pub is_eligible: bool,
    pub reason: Option<String>,
    pub tier_name: Option<String>,
    pub has_trace_analysis: bool,
}

/// Check if a project is eligible for trace summary generation.
/// Checks both workspace tier (must not be "free") and project settings (enable_trace_analysis).
pub async fn check_trace_eligibility(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<TraceEligibilityResult> {
    // Check workspace tier using cache (similar to limits.rs)
    let cache_key = format!("{}:{}", PROJECT_CACHE_KEY, project_id);
    let project_info = cache.get::<serde_json::Value>(&cache_key).await;

    let tier_name = match project_info {
        Ok(Some(info)) => {
            info.get("tier_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        }
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

    // Check if workspace is on paid tier
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

    // Check project settings for trace analysis enablement
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;
    use std::sync::Arc;
    use uuid::Uuid;

    // Note: These are integration tests that would require a real database
    // For unit testing, you would mock the database calls

    #[tokio::test]
    #[ignore] // Ignore by default since it requires database setup
    async fn test_eligibility_structure() {
        // Just test that the structure compiles and basic logic works
        let result = TraceEligibilityResult {
            is_eligible: false,
            reason: Some("test".to_string()),
            tier_name: Some("free".to_string()),
            has_trace_analysis: false,
        };

        assert!(!result.is_eligible);
        assert_eq!(result.reason, Some("test".to_string()));
        assert_eq!(result.tier_name, Some("free".to_string()));
        assert!(!result.has_trace_analysis);
    }
}
