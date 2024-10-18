use anyhow::Result;
use aws_sdk_s3::Client;

const URL_PREFIX: &str = "/api/images/";

#[derive(Clone)]
pub struct S3Storage {
    client: Client,
    bucket: String,
}

impl S3Storage {
    pub fn new(client: Client, bucket: String) -> Self {
        Self { client, bucket }
    }

    fn get_url(&self, key: &str) -> String {
        format!("{URL_PREFIX}{key}",)
    }

    fn get_key_from_url(&self, url: &str) -> String {
        url.strip_prefix(URL_PREFIX).unwrap().to_string()
    }
}

#[async_trait::async_trait]
impl super::Storage for S3Storage {
    async fn store(&self, data: Vec<u8>, key: &str) -> Result<String> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(data.into())
            .send()
            .await?;

        Ok(self.get_url(key))
    }

    async fn retrieve(&self, key: &str) -> Result<Vec<u8>> {
        let key = self.get_key_from_url(key);
        let resp = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;

        let bytes = resp.body.collect().await?.to_vec();
        Ok(bytes)
    }
}
