//! Input rules for profile writes, mirroring the Zod schemas in
//! `frontend/lib/actions/llm-profiles/schema.ts` so a hand-written API call
//! cannot store a shape the UI could not have produced. Pure: no DB, no cache.

use std::collections::HashSet;
use std::sync::LazyLock;

use regex::Regex;

use crate::llm::profiles::{LlmProfileProvider, ProfileAuth, ProfileConfig, ProfileSecrets};

use super::CrudError;

const NAME_MAX: usize = 255;
const MODEL_MAX: usize = 256;
const MODELS_MAX: usize = 64;
const HEADER_NAMES_MAX: usize = 32;
const SECRET_MAX: usize = 8192;

/// RFC 7230 token: the characters allowed in an HTTP header name.
static HEADER_NAME_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Za-z0-9!#$%&'*+.^_`|~-]+$").expect("static regex"));

pub(super) fn validate_name(name: &str) -> Result<String, CrudError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(CrudError::Validation("Name is required".to_string()));
    }
    if name.chars().count() > NAME_MAX {
        return Err(CrudError::Validation(format!(
            "Name must be at most {NAME_MAX} characters"
        )));
    }
    Ok(name.to_string())
}

pub(super) fn validate_models(models: Vec<String>) -> Result<Vec<String>, CrudError> {
    let models: Vec<String> = models.iter().map(|m| m.trim().to_string()).collect();
    if models.is_empty() {
        return Err(CrudError::Validation("Add at least one model".to_string()));
    }
    if models.len() > MODELS_MAX {
        return Err(CrudError::Validation(format!(
            "At most {MODELS_MAX} models per profile"
        )));
    }
    if models
        .iter()
        .any(|m| m.is_empty() || m.chars().count() > MODEL_MAX)
    {
        return Err(CrudError::Validation(format!(
            "Model names must be 1-{MODEL_MAX} characters"
        )));
    }
    if models.iter().collect::<HashSet<_>>().len() != models.len() {
        return Err(CrudError::Validation(
            "Model names must be unique".to_string(),
        ));
    }
    Ok(models)
}

/// Keeps only the fields the provider uses, trimmed, and checks the same
/// rules as `LlmProfileConfigSchema`.
pub(super) fn normalize_config(
    provider: LlmProfileProvider,
    config: ProfileConfig,
) -> Result<ProfileConfig, CrudError> {
    use LlmProfileProvider::*;
    let invalid = |m: &str| CrudError::Validation(m.to_string());
    let trimmed = |v: Option<String>| v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

    match provider {
        OpenaiCompletions | OpenaiResponses | Gemini => {
            require_api_key_auth(&config.auth)?;
            Ok(ProfileConfig::default())
        }
        AzureChatCompletions | AzureResponses | AzureAnthropic => {
            require_api_key_auth(&config.auth)?;
            let resource_id = trimmed(config.resource_id);
            let base_url = trimmed(config.base_url)
                .map(|u| validate_http_url(&u))
                .transpose()?;
            if resource_id.is_some() == base_url.is_some() {
                return Err(invalid("Provide exactly one of resource id or base URL"));
            }
            if resource_id
                .as_ref()
                .is_some_and(|r| r.chars().count() > 256)
            {
                return Err(invalid("Resource id must be at most 256 characters"));
            }
            let api_version = trimmed(config.api_version);
            if api_version.as_ref().is_some_and(|v| v.chars().count() > 64) {
                return Err(invalid("API version must be at most 64 characters"));
            }
            Ok(ProfileConfig {
                resource_id,
                base_url,
                api_version,
                ..ProfileConfig::default()
            })
        }
        Bedrock => {
            let region = trimmed(config.region).ok_or_else(|| invalid("AWS region is required"))?;
            if region.chars().count() > 64 {
                return Err(invalid("AWS region must be at most 64 characters"));
            }
            let auth = match config.auth {
                ProfileAuth::AwsKeys { access_key_id } => {
                    let access_key_id = access_key_id.trim().to_string();
                    if access_key_id.is_empty() || access_key_id.chars().count() > 256 {
                        return Err(invalid("AWS access key id must be 1-256 characters"));
                    }
                    ProfileAuth::AwsKeys { access_key_id }
                }
                ProfileAuth::BearerToken => ProfileAuth::BearerToken,
                ProfileAuth::ApiKey => {
                    return Err(invalid("Bedrock needs AWS keys or a bearer token"));
                }
            };
            Ok(ProfileConfig {
                auth,
                region: Some(region),
                ..ProfileConfig::default()
            })
        }
        Custom => {
            require_api_key_auth(&config.auth)?;
            let base_url = trimmed(config.base_url)
                .ok_or_else(|| invalid("Base URL is required"))
                .and_then(|u| validate_http_url(&u))?;
            let header_names: Vec<String> = config
                .header_names
                .iter()
                .map(|h| h.trim().to_string())
                .collect();
            if header_names.len() > HEADER_NAMES_MAX {
                return Err(invalid(&format!(
                    "At most {HEADER_NAMES_MAX} custom headers"
                )));
            }
            for name in &header_names {
                validate_header_name(name)?;
            }
            let lowered: HashSet<String> = header_names.iter().map(|h| h.to_lowercase()).collect();
            if lowered.len() != header_names.len() {
                return Err(invalid("Header names must be unique"));
            }
            Ok(ProfileConfig {
                base_url: Some(base_url),
                header_names,
                ..ProfileConfig::default()
            })
        }
    }
}

fn require_api_key_auth(auth: &ProfileAuth) -> Result<(), CrudError> {
    match auth {
        ProfileAuth::ApiKey => Ok(()),
        _ => Err(CrudError::Validation(
            "This provider authenticates with an API key".to_string(),
        )),
    }
}

/// http(s) only; trailing slashes are dropped so clients can append paths.
fn validate_http_url(raw: &str) -> Result<String, CrudError> {
    let parsed = url::Url::parse(raw).map_err(|_| {
        CrudError::Validation("URL must start with http:// or https://".to_string())
    })?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err(CrudError::Validation(
            "URL must start with http:// or https://".to_string(),
        ));
    }
    Ok(raw.trim_end_matches('/').to_string())
}

fn validate_header_name(name: &str) -> Result<(), CrudError> {
    if name.is_empty() || name.chars().count() > 256 || !HEADER_NAME_RE.is_match(name) {
        return Err(CrudError::Validation(format!(
            "Invalid HTTP header name '{name}'"
        )));
    }
    Ok(())
}

pub(super) fn validate_secret_values(secrets: &ProfileSecrets) -> Result<(), CrudError> {
    let check = |v: &String| -> Result<(), CrudError> {
        if v.is_empty() || v.len() > SECRET_MAX {
            return Err(CrudError::Validation(format!(
                "Secret values must be 1-{SECRET_MAX} characters"
            )));
        }
        if v.contains(['\r', '\n']) {
            return Err(CrudError::Validation(
                "Secret values must not contain line breaks".to_string(),
            ));
        }
        Ok(())
    };
    for v in [&secrets.api_key, &secrets.secret_access_key, &secrets.token]
        .into_iter()
        .flatten()
    {
        check(v)?;
    }
    for (name, value) in &secrets.headers {
        validate_header_name(name)?;
        check(value)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn custom(header_names: &[&str]) -> ProfileConfig {
        ProfileConfig {
            base_url: Some("https://gw.example.com".to_string()),
            header_names: header_names.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        }
    }

    #[test]
    fn normalize_enforces_provider_shapes() {
        let azure = normalize_config(
            LlmProfileProvider::AzureResponses,
            ProfileConfig {
                base_url: Some("https://r.services.ai.azure.com/".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            azure.base_url.as_deref(),
            Some("https://r.services.ai.azure.com")
        );

        let both = normalize_config(
            LlmProfileProvider::AzureResponses,
            ProfileConfig {
                base_url: Some("https://x.example".into()),
                resource_id: Some("r".into()),
                ..Default::default()
            },
        );
        assert!(matches!(both, Err(CrudError::Validation(_))));

        let bedrock_api_key = normalize_config(
            LlmProfileProvider::Bedrock,
            ProfileConfig {
                region: Some("eu-west-1".into()),
                ..Default::default()
            },
        );
        assert!(matches!(bedrock_api_key, Err(CrudError::Validation(_))));

        let stray = normalize_config(
            LlmProfileProvider::Gemini,
            ProfileConfig {
                region: Some("ignored".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(stray.region.is_none());

        let dup = normalize_config(LlmProfileProvider::Custom, custom(&["X-A", "x-a"]));
        assert!(matches!(dup, Err(CrudError::Validation(m)) if m.contains("unique")));

        let bad_url = normalize_config(
            LlmProfileProvider::Custom,
            ProfileConfig {
                base_url: Some("ftp://gw".into()),
                ..Default::default()
            },
        );
        assert!(matches!(bad_url, Err(CrudError::Validation(_))));
    }

    #[test]
    fn models_are_trimmed_and_unique() {
        assert_eq!(
            validate_models(vec![" a ".into(), "b".into()]).unwrap(),
            vec!["a", "b"]
        );
        assert!(validate_models(vec![]).is_err());
        assert!(validate_models(vec!["a".into(), "a ".into()]).is_err());
    }
}
