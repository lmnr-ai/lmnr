//! Which secret a profile's auth needs, how a draft's secrets combine with the
//! stored ones, and how they are masked on the way out. Pure: no DB, no cache.

use std::collections::HashMap;

use serde::Serialize;

use crate::llm::profiles::{LlmProfileProvider, ProfileAuth, ProfileConfig, ProfileSecrets};

use super::CrudError;

/// Masks instead of secrets: `first3***last3` per stored value (fully starred
/// when short), header names only.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SecretsPresence {
    pub api_key: Option<String>,
    pub secret_access_key: Option<String>,
    pub token: Option<String>,
    pub headers: Vec<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SecretKey {
    ApiKey,
    SecretAccessKey,
    Token,
}

impl SecretKey {
    fn label(self) -> &'static str {
        match self {
            Self::ApiKey => "apiKey",
            Self::SecretAccessKey => "secretAccessKey",
            Self::Token => "token",
        }
    }
}

/// The one secret field the provider's auth needs.
fn required_secret_key(provider: LlmProfileProvider, config: &ProfileConfig) -> SecretKey {
    if provider != LlmProfileProvider::Bedrock {
        return SecretKey::ApiKey;
    }
    match config.auth {
        ProfileAuth::AwsKeys { .. } => SecretKey::SecretAccessKey,
        _ => SecretKey::Token,
    }
}

fn secret_value(secrets: &ProfileSecrets, key: SecretKey) -> Option<&String> {
    match key {
        SecretKey::ApiKey => secrets.api_key.as_ref(),
        SecretKey::SecretAccessKey => secrets.secret_access_key.as_ref(),
        SecretKey::Token => secrets.token.as_ref(),
    }
    .filter(|v| !v.is_empty())
}

/// Keeps only the secrets the config still needs, so switching auth methods
/// or dropping a header does not leave stale credentials behind.
pub(super) fn prune_secrets(
    provider: LlmProfileProvider,
    config: &ProfileConfig,
    secrets: ProfileSecrets,
) -> ProfileSecrets {
    let key = required_secret_key(provider, config);
    let value = secret_value(&secrets, key).cloned();
    let mut pruned = ProfileSecrets::default();
    match key {
        SecretKey::ApiKey => pruned.api_key = value,
        SecretKey::SecretAccessKey => pruned.secret_access_key = value,
        SecretKey::Token => pruned.token = value,
    }
    if provider == LlmProfileProvider::Custom {
        pruned.headers = config
            .header_names
            .iter()
            .filter_map(|name| {
                secrets
                    .headers
                    .get(name)
                    .filter(|v| !v.is_empty())
                    .map(|v| (name.clone(), v.clone()))
            })
            .collect();
    }
    pruned
}

/// Overlay of freshly entered secrets on the stored ones; omitted fields keep their stored value.
pub(super) fn merge_secrets(stored: ProfileSecrets, incoming: ProfileSecrets) -> ProfileSecrets {
    let mut headers: HashMap<String, String> = stored.headers;
    headers.extend(incoming.headers);
    ProfileSecrets {
        api_key: incoming.api_key.or(stored.api_key),
        secret_access_key: incoming.secret_access_key.or(stored.secret_access_key),
        token: incoming.token.or(stored.token),
        headers,
    }
}

pub(super) fn assert_secrets_complete(
    provider: LlmProfileProvider,
    config: &ProfileConfig,
    secrets: &ProfileSecrets,
) -> Result<(), CrudError> {
    let key = required_secret_key(provider, config);
    if secret_value(secrets, key).is_none() {
        return Err(CrudError::Validation(format!(
            "{} is required",
            key.label()
        )));
    }
    if provider == LlmProfileProvider::Custom
        && let Some(missing) = config
            .header_names
            .iter()
            .find(|name| !secrets.headers.contains_key(*name))
    {
        return Err(CrudError::Validation(format!(
            "Value for header \"{missing}\" is required"
        )));
    }
    Ok(())
}

const MASK_EDGE: usize = 3;

/// `first3***last3`; values short enough that the edges would reveal most of
/// them are fully starred.
fn mask_secret(value: Option<&String>) -> Option<String> {
    let value = value.filter(|v| !v.is_empty())?;
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= MASK_EDGE * 3 {
        return Some("*".repeat(chars.len()));
    }
    let head: String = chars[..MASK_EDGE].iter().collect();
    let tail: String = chars[chars.len() - MASK_EDGE..].iter().collect();
    Some(format!(
        "{head}{}{tail}",
        "*".repeat(chars.len() - MASK_EDGE * 2)
    ))
}

pub(super) fn presence(secrets: &ProfileSecrets) -> SecretsPresence {
    let mut headers: Vec<String> = secrets.headers.keys().cloned().collect();
    headers.sort();
    SecretsPresence {
        api_key: mask_secret(secrets.api_key.as_ref()),
        secret_access_key: mask_secret(secrets.secret_access_key.as_ref()),
        token: mask_secret(secrets.token.as_ref()),
        headers,
    }
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
    fn mask_keeps_three_chars_at_each_edge() {
        assert_eq!(
            mask_secret(Some(&"sk-abcdefghij456".to_string())).unwrap(),
            "sk-**********456"
        );
        assert_eq!(mask_secret(Some(&"short".to_string())).unwrap(), "*****");
        assert_eq!(mask_secret(Some(&String::new())), None);
        assert_eq!(mask_secret(None), None);
    }

    #[test]
    fn prune_drops_secrets_the_provider_does_not_use() {
        let secrets = ProfileSecrets {
            api_key: Some("k".into()),
            secret_access_key: Some("s".into()),
            token: Some("t".into()),
            headers: HashMap::from([("X-A".to_string(), "1".to_string())]),
        };
        let pruned = prune_secrets(
            LlmProfileProvider::Gemini,
            &ProfileConfig::default(),
            secrets.clone(),
        );
        assert_eq!(pruned.api_key.as_deref(), Some("k"));
        assert!(pruned.secret_access_key.is_none() && pruned.token.is_none());
        assert!(pruned.headers.is_empty());

        let bedrock = ProfileConfig {
            auth: ProfileAuth::BearerToken,
            region: Some("us-east-1".into()),
            ..Default::default()
        };
        let pruned = prune_secrets(LlmProfileProvider::Bedrock, &bedrock, secrets.clone());
        assert_eq!(pruned.token.as_deref(), Some("t"));
        assert!(pruned.api_key.is_none());

        let pruned = prune_secrets(LlmProfileProvider::Custom, &custom(&["X-A"]), secrets);
        assert_eq!(pruned.headers.get("X-A").map(String::as_str), Some("1"));
    }

    #[test]
    fn merge_keeps_stored_values_for_omitted_keys() {
        let stored = ProfileSecrets {
            api_key: Some("old".into()),
            headers: HashMap::from([("X-A".into(), "1".into()), ("X-B".into(), "2".into())]),
            ..Default::default()
        };
        let incoming = ProfileSecrets {
            headers: HashMap::from([("X-B".into(), "9".into())]),
            ..Default::default()
        };
        let merged = merge_secrets(stored, incoming);
        assert_eq!(merged.api_key.as_deref(), Some("old"));
        assert_eq!(merged.headers["X-A"], "1");
        assert_eq!(merged.headers["X-B"], "9");
    }

    #[test]
    fn complete_requires_the_providers_key_and_every_listed_header() {
        let err = assert_secrets_complete(
            LlmProfileProvider::Custom,
            &custom(&["X-A"]),
            &ProfileSecrets {
                api_key: Some("k".into()),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(matches!(err, CrudError::Validation(m) if m.contains("X-A")));

        let err = assert_secrets_complete(
            LlmProfileProvider::OpenaiCompletions,
            &ProfileConfig::default(),
            &ProfileSecrets::default(),
        )
        .unwrap_err();
        assert!(matches!(err, CrudError::Validation(m) if m == "apiKey is required"));
    }

    #[test]
    fn secrets_serialize_without_absent_keys() {
        let json = serde_json::to_string(&ProfileSecrets {
            api_key: Some("k".into()),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(json, r#"{"apiKey":"k"}"#);
    }
}
