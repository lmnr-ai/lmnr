#![cfg_attr(not(feature = "signals"), allow(dead_code))]

mod accumulator;
pub mod client;
pub mod conversions;

pub use client::OpenAIClient;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum OpenAIError {
    #[error("Request failed: {0}")]
    RequestError(#[from] reqwest::Error),

    #[error("Failed to parse response: {0}")]
    ParseError(#[from] serde_json::Error),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("OpenAI API error ({status_code}): {message}")]
    ApiError { status_code: u16, message: String },
}

impl OpenAIError {
    pub fn config<S: Into<String>>(msg: S) -> Self {
        OpenAIError::ConfigError(msg.into())
    }
}

impl From<OpenAIError> for super::ProviderError {
    fn from(e: OpenAIError) -> Self {
        match e {
            OpenAIError::RequestError(e) => super::ProviderError::RequestError(e.to_string()),
            OpenAIError::ParseError(e) => super::ProviderError::ParseError(e.to_string()),
            OpenAIError::ConfigError(s) => super::ProviderError::ConfigError(s),
            OpenAIError::ApiError {
                status_code,
                message,
            } => {
                let retryable = status_code == 429 || status_code >= 500;
                let resource_exhausted = status_code == 429;
                super::ProviderError::ApiError {
                    status_code,
                    message,
                    retryable,
                    resource_exhausted,
                }
            }
        }
    }
}
