use super::{BatchCreateRequest, GeminiError, InlineRequestItem, Operation};
use std::env;

#[derive(Clone)]
pub struct GeminiClient {
    client: reqwest::Client,
    api_key: String,
    api_base_url: String,
}

pub type GeminiResult<T> = Result<T, GeminiError>;

impl GeminiClient {
    pub fn new() -> GeminiResult<Self> {
        let api_key = env::var("GOOGLE_GENERATIVE_AI_API_KEY").map_err(|_| {
            GeminiError::config("GOOGLE_GENERATIVE_AI_API_KEY environment variable not set")
        })?;

        let api_base_url = env::var("GEMINI_API_BASE_URL")
            .unwrap_or_else(|_| "https://generativelanguage.googleapis.com/v1beta".to_string());

        Ok(Self {
            client: reqwest::Client::new(),
            api_key,
            api_base_url,
        })
    }

    pub async fn create_batch(
        &self,
        model: &str,
        requests: Vec<InlineRequestItem>,
        display_name: Option<String>,
    ) -> GeminiResult<Operation> {
        let url = format!(
            "{}/models/{}:batchGenerateContent",
            self.api_base_url, model
        );

        let batch_request = BatchCreateRequest::inline(requests, display_name);

        let response = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .header("Content-Type", "application/json")
            .json(&batch_request)
            .send()
            .await?;

        let status = response.status();

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log::error!("Gemini API error ({}): {}", status, error_text);

            return Err(GeminiError::from_response(status.as_u16(), error_text));
        }

        let response_text = response.text().await?;

        let operation: Operation = serde_json::from_str(&response_text)?;

        Ok(operation)
    }

    pub async fn get_batch(&self, batch_name: &str) -> GeminiResult<Operation> {
        let url = format!("{}/batches/{}", self.api_base_url, batch_name);

        let response = self
            .client
            .get(&url)
            .header("x-goog-api-key", &self.api_key)
            .send()
            .await?;

        let status = response.status();

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log::error!("Gemini API error ({}): {}", status, error_text);

            return Err(GeminiError::from_response(status.as_u16(), error_text));
        }

        let response_text = response.text().await?;

        let operation: Operation = serde_json::from_str(&response_text)?;

        Ok(operation)
    }
}
