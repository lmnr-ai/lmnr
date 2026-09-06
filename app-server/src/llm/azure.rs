//! Shared endpoint resolution for the Azure-hosted providers. `azure_chat_completions`,
//! `azure_responses`, and `azure_anthropic` all live on one
//! `<resource>.services.ai.azure.com` host and differ only in the API-shape path
//! below it, so they read one resource id / base URL pair.

use crate::env;

/// Either the resource name or a full base URL, on top of `LLM_API_KEY`.
pub(crate) fn has_endpoint() -> bool {
    [env::llm::AZURE_RESOURCE_ID, env::llm::AZURE_BASE_URL]
        .iter()
        .any(|name| std::env::var(name).is_ok_and(|v| !v.trim().is_empty()))
}

/// `AZURE_BASE_URL` wins over `AZURE_RESOURCE_ID`. Returns the host root; callers
/// append their own API-shape path (`/openai/v1`, `/anthropic`).
pub(crate) fn resource_root() -> Result<String, String> {
    if let Some(base_url) = non_empty_env(env::llm::AZURE_BASE_URL) {
        return Ok(strip_api_shape_path(&base_url));
    }
    let resource_id = non_empty_env(env::llm::AZURE_RESOURCE_ID).ok_or_else(|| {
        "AZURE_RESOURCE_ID or AZURE_BASE_URL must be set when LLM_PROVIDER is an azure_* provider"
            .to_string()
    })?;
    Ok(format!("https://{resource_id}.services.ai.azure.com"))
}

/// Accepts the portal endpoint (`https://r.services.ai.azure.com`) or an endpoint
/// pasted with an API-shape path already on it — callers append their own, so
/// `/openai` and `/anthropic` (with or without `/v1`) are trimmed back off.
fn strip_api_shape_path(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches('/');
    let root = match trimmed.strip_suffix("/v1") {
        Some(root) if root.ends_with("/openai") || root.ends_with("/anthropic") => root,
        _ => trimmed,
    };
    root.strip_suffix("/openai")
        .or_else(|| root.strip_suffix("/anthropic"))
        .unwrap_or(root)
        .to_string()
}

fn non_empty_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_api_shape_path_trims_back_to_the_host_root() {
        for raw in [
            "https://my-resource.services.ai.azure.com/",
            "https://my-resource.services.ai.azure.com/openai",
            "https://my-resource.services.ai.azure.com/openai/v1",
            "https://my-resource.services.ai.azure.com/anthropic",
            "https://my-resource.services.ai.azure.com/anthropic/v1/",
        ] {
            assert_eq!(
                strip_api_shape_path(raw),
                "https://my-resource.services.ai.azure.com",
                "{raw}"
            );
        }
        // A gateway path that merely ends in `/v1` is not an API-shape suffix.
        assert_eq!(
            strip_api_shape_path("https://gateway.internal/azure/v1"),
            "https://gateway.internal/azure/v1"
        );
    }

    #[test]
    fn resource_root_derives_the_host_from_the_resource_id() {
        let root = crate::llm::with_env_vars(
            &[
                (env::llm::AZURE_RESOURCE_ID, "my-resource"),
                (env::llm::AZURE_BASE_URL, ""),
            ],
            || resource_root().unwrap(),
        );
        assert_eq!(root, "https://my-resource.services.ai.azure.com");
    }
}
