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
        format!("/api/projects/{}/images/{}", parts[0], parts[1])
    }

    fn get_key_from_url(&self, url: &str) -> String {
        let parts = url
            .strip_prefix("/api/projects/")
            .unwrap()
            .split("/")
            .collect::<Vec<&str>>();
        format!("project/{}/{}", parts[0], parts[1])
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
