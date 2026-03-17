use anyhow::Result;
use async_trait::async_trait;
use aws_sdk_s3::Client;
use std::pin::Pin;

#[derive(Clone)]
pub struct S3Storage {
    client: Client,
}

impl S3Storage {
    pub fn new(client: Client) -> Self {
        Self { client }
    }
}

#[async_trait]
impl super::StorageTrait for S3Storage {
    type StorageBytesStream =
        Pin<Box<dyn futures_util::stream::Stream<Item = bytes::Bytes> + Send + 'static>>;

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
