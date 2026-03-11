use super::{
    BatchCreateRequest, GeminiError, GenerateContentRequest, GenerateContentResponse,
    InlineRequestItem, Operation,
};
use crate::signals::provider::{
    LanguageModelClient, ProviderResult,
    models::{ProviderBatchOperation, ProviderRequest, ProviderRequestItem, ProviderResponse},
};
use std::{env, time::Duration};

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
            .unwrap_or("https://generativelanguage.googleapis.com/v1beta".to_string());

        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| GeminiError::config(format!("Failed to build HTTP client: {}", e)))?;

        Ok(Self {
            client,
            api_key,
            api_base_url,
        })
    }

    pub async fn generate_content(
        &self,
        model: &str,
        request: &GenerateContentRequest,
    ) -> GeminiResult<GenerateContentResponse> {
        let url = format!("{}/models/{}:generateContent", self.api_base_url, model);

        let response = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .header("Content-Type", "application/json")
            .json(request)
            .send()
            .await?;

        let status = response.status();

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log::error!("Gemini API error ({}): {}", status, error_text);

            return Err(GeminiError::from_response(status.as_u16(), error_text));
        }

        let response_text = response.text().await?;

        let generate_response: GenerateContentResponse = serde_json::from_str(&response_text)?;

        Ok(generate_response)
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

impl LanguageModelClient for GeminiClient {
    fn supports_batch(&self) -> bool {
        true
    }

    async fn generate_content(
        &self,
        model: &str,
        request: &ProviderRequest,
    ) -> ProviderResult<ProviderResponse> {
        // Provider types share the same JSON schema as Gemini types (camelCase),
        // so serde round-trip conversion is safe here.
        let gemini_req: GenerateContentRequest =
            serde_json::from_value(serde_json::to_value(request).map_err(|e| {
                super::super::ProviderError::RequestError(format!(
                    "Failed to serialize request: {}",
                    e
                ))
            })?)
            .map_err(|e| {
                super::super::ProviderError::RequestError(format!(
                    "Failed to convert request to Gemini format: {}",
                    e
                ))
            })?;
        let res = self.generate_content(model, &gemini_req).await?;
        Ok(res.into())
    }

    async fn create_batch(
        &self,
        model: &str,
        requests: Vec<ProviderRequestItem>,
        display_name: Option<String>,
    ) -> ProviderResult<ProviderBatchOperation> {
        let gemini_reqs: Vec<InlineRequestItem> = requests
            .into_iter()
            .map(|r| {
                let val = serde_json::to_value(r).map_err(|e| {
                    super::super::ProviderError::RequestError(format!(
                        "Failed to serialize batch request: {}",
                        e
                    ))
                })?;
                serde_json::from_value(val).map_err(|e| {
                    super::super::ProviderError::RequestError(format!(
                        "Failed to convert batch request to Gemini format: {}",
                        e
                    ))
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        let res = GeminiClient::create_batch(self, model, gemini_reqs, display_name).await?;
        Ok(res.into())
    }

    async fn get_batch(&self, batch_name: &str) -> ProviderResult<ProviderBatchOperation> {
        let res = GeminiClient::get_batch(self, batch_name).await?;
        Ok(res.into())
    }
}
