use anyhow::Result;
use async_trait::async_trait;
use aws_sdk_s3::Client;
use std::pin::Pin;
use tracing::instrument;

#[derive(Clone)]
pub struct S3Storage {
    client: Client,
}

impl S3Storage {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    fn get_url(&self, key: &str) -> String {
        let parts = key
            .strip_prefix("project/")
            .unwrap()
            .split("/")
            .collect::<Vec<&str>>();
        format!("/api/projects/{}/payloads/{}", parts[0], parts[1])
    }
}

#[async_trait]
impl super::StorageTrait for S3Storage {
    type StorageBytesStream =
        Pin<Box<dyn futures_util::stream::Stream<Item = bytes::Bytes> + Send + 'static>>;

    #[instrument(skip(self, data))]
    async fn store(&self, bucket: &str, key: &str, data: Vec<u8>) -> Result<String> {
        // Direct storage method used by the payload worker
        self.client
            .put_object()
            .bucket(bucket)
            .key(key)
            .body(data.into())
            .send()
            .await?;

        Ok(self.get_url(key))
    }

    async fn get_stream(&self, bucket: &str, key: &str) -> Result<Self::StorageBytesStream> {
        let response = self
            .client
            .get_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await?;

        Ok(Box::pin(futures_util::stream::unfold(
            response.body,
            |mut body| async move {
                let chunk = body.next().await?.ok()?;
                Some((chunk, body))
            },
        )))
    }

    async fn get_size(&self, bucket: &str, key: &str) -> Result<u64> {
        let response = self
            .client
            .head_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await?;

        response
            .content_length
            .ok_or(anyhow::anyhow!("Content length not found"))
            .map(|l| l as u64)
    }
}
