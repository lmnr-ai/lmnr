//! Which optional `config` fields each provider sends. A write that sets any
//! other field is rejected rather than having the field silently dropped.

use crate::llm::profiles::{LlmProfileProvider, ProfileConfig};

use super::CrudError;

pub(super) const GATEWAY_HINT: &str = "for a gateway with a custom base URL and headers use provider `custom` \
                            (Chat Completions) or `custom_responses` (Responses API)";

/// The optional `config` fields; `auth` is checked per provider in `normalize_config`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConfigField {
    Region,
    ResourceId,
    ApiVersion,
    BaseUrl,
    HeaderNames,
}

impl ConfigField {
    const ALL: [Self; 5] = [
        Self::Region,
        Self::ResourceId,
        Self::ApiVersion,
        Self::BaseUrl,
        Self::HeaderNames,
    ];

    fn wire_name(self) -> &'static str {
        match self {
            Self::Region => "region",
            Self::ResourceId => "resourceId",
            Self::ApiVersion => "apiVersion",
            Self::BaseUrl => "baseUrl",
            Self::HeaderNames => "headerNames",
        }
    }

    /// Blank strings count as absent, matching how `normalize_config` trims.
    fn is_set(self, config: &ProfileConfig) -> bool {
        let non_blank = |v: &Option<String>| v.as_deref().is_some_and(|s| !s.trim().is_empty());
        match self {
            Self::Region => non_blank(&config.region),
            Self::ResourceId => non_blank(&config.resource_id),
            Self::ApiVersion => non_blank(&config.api_version),
            Self::BaseUrl => non_blank(&config.base_url),
            Self::HeaderNames => !config.header_names.is_empty(),
        }
    }
}

/// The optional `config` fields each provider sends.
fn used_fields(provider: LlmProfileProvider) -> &'static [ConfigField] {
    use ConfigField::*;
    use LlmProfileProvider::*;
    match provider {
        OpenaiCompletions | OpenaiResponses | Anthropic | Gemini | Groq | Mistral => &[],
        Bedrock => &[Region],
        AzureChatCompletions | AzureResponses | AzureAnthropic => {
            &[ResourceId, ApiVersion, BaseUrl]
        }
        Custom | CustomResponses => &[BaseUrl, HeaderNames],
    }
}

pub(super) fn reject_unused_fields(
    provider: LlmProfileProvider,
    config: &ProfileConfig,
) -> Result<(), CrudError> {
    let used = used_fields(provider);
    let unused: Vec<ConfigField> = ConfigField::ALL
        .into_iter()
        .filter(|field| field.is_set(config) && !used.contains(field))
        .collect();
    if unused.is_empty() {
        return Ok(());
    }

    let names: Vec<&str> = unused.iter().map(|field| field.wire_name()).collect();
    let gateway_field = unused
        .iter()
        .any(|field| matches!(field, ConfigField::BaseUrl | ConfigField::HeaderNames));
    let hint = if gateway_field {
        format!("; {GATEWAY_HINT}")
    } else {
        String::new()
    };
    Err(CrudError::Validation(format!(
        "Provider `{}` does not use {}{hint}",
        provider.wire_name(),
        names.join(", ")
    )))
}
