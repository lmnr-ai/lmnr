use anyhow::Result;
use aws_sdk_s3::Client;

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
        let parts = key
            .strip_prefix("project/")
            .unwrap()
            .split("/")
            .collect::<Vec<&str>>();
        format!("/api/projects/{}/payloads/{}", parts[0], parts[1])
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
}
