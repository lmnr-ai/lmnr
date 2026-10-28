use std::time::Duration;

use anyhow::{Result, anyhow};
use async_trait::async_trait;
use aws_sdk_s3::{
    Client,
    presigning::PresigningConfig,
    primitives::ByteStream,
    types::{CompletedMultipartUpload, CompletedPart},
};
use bytes::{Bytes, BytesMut};
use tokio::sync::mpsc::Receiver;

use super::StorageBytesStream;

// S3 requires every multipart part but the last to be at least 5 MiB.
const UPLOAD_PART_SIZE: usize = 8 * 1024 * 1024;

#[derive(Clone)]
pub struct S3Storage {
    client: Client,
}

struct UploadedParts {
    parts: Vec<CompletedPart>,
    size: u64,
}

impl S3Storage {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    async fn upload_parts(
        &self,
        bucket: &str,
        key: &str,
        upload_id: &str,
        chunks: &mut Receiver<Result<Bytes>>,
    ) -> Result<UploadedParts> {
        let mut parts = Vec::new();
        let mut size = 0;
        let mut buffer = BytesMut::with_capacity(UPLOAD_PART_SIZE);
        while let Some(chunk) = chunks.recv().await {
            let chunk = chunk?;
            size += chunk.len() as u64;
            buffer.extend_from_slice(&chunk);
            if buffer.len() >= UPLOAD_PART_SIZE {
                let part = buffer.split().freeze();
                parts.push(
                    self.upload_part(bucket, key, upload_id, parts.len(), part)
                        .await?,
                );
            }
        }
        if !buffer.is_empty() || parts.is_empty() {
            let part = buffer.freeze();
            parts.push(
                self.upload_part(bucket, key, upload_id, parts.len(), part)
                    .await?,
            );
        }
        Ok(UploadedParts { parts, size })
    }

    async fn upload_part(
        &self,
        bucket: &str,
        key: &str,
        upload_id: &str,
        index: usize,
        body: Bytes,
    ) -> Result<CompletedPart> {
        let part_number = index as i32 + 1;
        let response = self
            .client
            .upload_part()
            .bucket(bucket)
            .key(key)
            .upload_id(upload_id)
            .part_number(part_number)
            .body(ByteStream::from(body))
            .send()
            .await?;
        Ok(CompletedPart::builder()
            .part_number(part_number)
            .set_e_tag(response.e_tag)
            .build())
    }
}

#[async_trait]
impl super::StorageTrait for S3Storage {
    async fn get_stream(&self, bucket: &str, key: &str) -> Result<StorageBytesStream> {
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

    async fn upload_stream(
        &self,
        bucket: &str,
        key: &str,
        mut chunks: Receiver<Result<Bytes>>,
    ) -> Result<u64> {
        let upload_id = self
            .client
            .create_multipart_upload()
            .bucket(bucket)
            .key(key)
            .send()
            .await?
            .upload_id
            .ok_or(anyhow!("S3 returned no multipart upload id"))?;

        match self
            .upload_parts(bucket, key, &upload_id, &mut chunks)
            .await
        {
            Ok(uploaded) => {
                self.client
                    .complete_multipart_upload()
                    .bucket(bucket)
                    .key(key)
                    .upload_id(&upload_id)
                    .multipart_upload(
                        CompletedMultipartUpload::builder()
                            .set_parts(Some(uploaded.parts))
                            .build(),
                    )
                    .send()
                    .await?;
                Ok(uploaded.size)
            }
            Err(e) => {
                if let Err(abort_err) = self
                    .client
                    .abort_multipart_upload()
                    .bucket(bucket)
                    .key(key)
                    .upload_id(&upload_id)
                    .send()
                    .await
                {
                    log::error!("Failed to abort S3 multipart upload of {key}: {abort_err:?}");
                }
                Err(e)
            }
        }
    }

    async fn presigned_get_url(
        &self,
        bucket: &str,
        key: &str,
        expires_in: Duration,
    ) -> Result<String> {
        let request = self
            .client
            .get_object()
            .bucket(bucket)
            .key(key)
            .presigned(PresigningConfig::expires_in(expires_in)?)
            .await?;
        Ok(request.uri().to_string())
    }
}
