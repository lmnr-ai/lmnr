use anyhow::Result;
use reqwest::Client;
use serde::de::DeserializeOwned;

#[derive(Clone)]
pub struct Endpoint {
    client: Client,
    endpoint: String,
    api_key: String,
}

impl Endpoint {
    pub fn new(client: Client, endpoint: String, api_key: String) -> Self {
        Self {
            client,
            endpoint,
            api_key,
        }
    }
}

impl Endpoint {
    pub async fn call<T: DeserializeOwned>(&self, body: String) -> Result<T> {
        let res = self
            .client
            .post(&self.endpoint)
            .header("Content-Type", "application/json")
            .body(body)
            .bearer_auth(&self.api_key)
            .send()
            .await?;

        if !res.status().is_success() {
            return Err(anyhow::anyhow!("Error calling api, {:}", res.text().await?));
        }

        let res_body = res.json::<T>().await?;

        Ok(res_body)
    }
}
