//! Our image registry: the account's ECR unless `HOSTED_EVALS_REGISTRY_URL`
//! names another. Credentials never leave the app-server except to the sandbox
//! provider, which pulls with them. Each project pushes to its own repository,
//! `<prefix>/<project id>`, and only the app-server names images, so a project
//! can't reach another's.

use std::{
    collections::HashSet,
    sync::{Arc, LazyLock, Mutex},
    time::{Duration, Instant},
};

use anyhow::{Context, Result, anyhow, bail};
use aws_config::SdkConfig;
use aws_sdk_ecr::{operation::create_repository::CreateRepositoryError, types::ImageTagMutability};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use bytes::Bytes;
use futures_util::StreamExt;
use reqwest::{Body, Client, Response, StatusCode, redirect::Policy};
use serde_json::json;
use sha2::{Digest, Sha256};
use tokio::sync::mpsc::{self, Receiver};
use tokio_stream::wrappers::ReceiverStream;
use uuid::Uuid;

use super::{
    images::Blob,
    provider::{PushedImage, RegistryCredentials, registry_host},
};
use crate::env;

pub const MANIFEST_MEDIA_TYPE: &str = "application/vnd.oci.image.manifest.v1+json";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// ECR tokens last 12 hours; reusing one for 6 leaves the provider hours to pull.
const ECR_TOKEN_REUSE: Duration = Duration::from_secs(6 * 60 * 60);
/// ECR deletes images pushed this long ago. Snapshots keep their own copy, and a
/// later run re-uploads any layer that went with them (`missing_layers`).
const ECR_IMAGE_RETENTION_DAYS: u32 = 30;

/// Registry requests don't follow redirects: ECR may answer a blob `HEAD` with a
/// redirect to S3, which already says the blob exists.
static REGISTRY_HTTP: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .build()
        .expect("Failed to build the registry HTTP client")
});

pub enum ImageRegistry {
    Ecr(Ecr),
    Generic(RegistryCredentials),
}

pub struct Ecr {
    client: aws_sdk_ecr::Client,
    token: Mutex<Option<(RegistryCredentials, Instant)>>,
    /// Repositories this process created or found, so pushes skip CreateRepository.
    repositories: Mutex<HashSet<String>>,
}

impl ImageRegistry {
    pub fn from_env(aws: &SdkConfig) -> Result<Self> {
        let Some(url) = env::optional_string(env::hosted_evals::REGISTRY_URL) else {
            return Ok(Self::Ecr(Ecr {
                client: aws_sdk_ecr::Client::new(aws),
                token: Mutex::new(None),
                repositories: Mutex::new(HashSet::new()),
            }));
        };
        let credential = |name| {
            env::optional_string(name).with_context(|| {
                format!(
                    "{name} is required with {}",
                    env::hosted_evals::REGISTRY_URL
                )
            })
        };
        Ok(Self::Generic(RegistryCredentials {
            host: registry_host(&url),
            username: credential(env::hosted_evals::REGISTRY_USERNAME)?,
            password: credential(env::hosted_evals::REGISTRY_PASSWORD)?,
        }))
    }

    pub async fn repository(&self, project_id: &Uuid) -> Result<Repository<'_>> {
        let credentials = match self {
            Self::Ecr(ecr) => ecr.credentials().await?,
            Self::Generic(credentials) => credentials.clone(),
        };
        Ok(Repository {
            registry: self,
            credentials,
            name: format!(
                "{}/{project_id}",
                env::hosted_evals::REGISTRY_REPOSITORY_PREFIX.get()
            ),
        })
    }
}

impl Ecr {
    /// A token for the account's default ECR registry, reused while fresh.
    async fn credentials(&self) -> Result<RegistryCredentials> {
        if let Some((credentials, fetched)) = &*self.token.lock().unwrap()
            && fetched.elapsed() < ECR_TOKEN_REUSE
        {
            return Ok(credentials.clone());
        }
        let output = self
            .client
            .get_authorization_token()
            .send()
            .await
            .context("ECR GetAuthorizationToken failed")?;
        let data = output
            .authorization_data()
            .first()
            .context("ECR returned no authorization data")?;
        let token = BASE64.decode(
            data.authorization_token()
                .context("ECR returned no token")?,
        )?;
        let (username, password) = std::str::from_utf8(&token)?
            .split_once(':')
            .context("Malformed ECR token")?;
        let credentials = RegistryCredentials {
            host: registry_host(data.proxy_endpoint().context("ECR returned no endpoint")?),
            username: username.to_string(),
            password: password.to_string(),
        };
        *self.token.lock().unwrap() = Some((credentials.clone(), Instant::now()));
        Ok(credentials)
    }

    async fn ensure_repository(&self, name: &str) -> Result<()> {
        if self.repositories.lock().unwrap().contains(name) {
            return Ok(());
        }
        let created = self
            .client
            .create_repository()
            .repository_name(name)
            // Tags are manifest digests, so a tag never moves anyway.
            .image_tag_mutability(ImageTagMutability::Mutable)
            .send()
            .await;
        match created.map_err(|e| e.into_service_error()) {
            Ok(_) => self.set_lifecycle_policy(name).await,
            Err(CreateRepositoryError::RepositoryAlreadyExistsException(_)) => {}
            Err(e) => return Err(anyhow!(e).context("ECR CreateRepository failed")),
        }
        self.repositories.lock().unwrap().insert(name.to_string());
        Ok(())
    }

    async fn set_lifecycle_policy(&self, name: &str) {
        let policy = json!({ "rules": [{
            "rulePriority": 1,
            "description": "Expire hosted-evals images; snapshots keep their own copy",
            "selection": {
                "tagStatus": "any",
                "countType": "sinceImagePushed",
                "countUnit": "days",
                "countNumber": ECR_IMAGE_RETENTION_DAYS,
            },
            "action": { "type": "expire" },
        }]});
        if let Err(e) = self
            .client
            .put_lifecycle_policy()
            .repository_name(name)
            .lifecycle_policy_text(policy.to_string())
            .send()
            .await
        {
            log::warn!("Failed to set the lifecycle policy of {name}: {e:?}");
        }
    }
}

/// One project's repository.
pub struct Repository<'a> {
    registry: &'a ImageRegistry,
    credentials: RegistryCredentials,
    name: String,
}

impl Repository<'_> {
    /// ECR repositories must exist before a push; other registries create them
    /// on push.
    pub async fn ensure_exists(&self) -> Result<()> {
        match self.registry {
            ImageRegistry::Ecr(ecr) => ecr.ensure_repository(&self.name).await,
            ImageRegistry::Generic(_) => Ok(()),
        }
    }

    pub fn pushed_image(&self, digest: &str) -> PushedImage {
        PushedImage {
            digest: digest.to_string(),
            reference: format!(
                "{}/{}:{}",
                self.credentials.host,
                self.name,
                image_tag(digest)
            ),
            registry: self.credentials.clone(),
        }
    }

    pub async fn blob_exists(&self, digest: &str) -> Result<bool> {
        let response = self
            .request(REGISTRY_HTTP.head(self.url(&format!("blobs/{digest}"))))
            .send()
            .await?;
        match response.status() {
            status if status.is_success() || status.is_redirection() => Ok(true),
            StatusCode::NOT_FOUND => Ok(false),
            status => bail!("Registry blob check returned {status}"),
        }
    }

    /// Streams `chunks` into a new blob, hashing as it goes. The sender must end
    /// the stream with an `Err` to abort.
    pub async fn upload_blob(&self, chunks: Receiver<Result<Bytes>>) -> Result<Blob> {
        let started = check(
            self.request(REGISTRY_HTTP.post(self.url("blobs/uploads/")))
                .send()
                .await?,
        )
        .await?;
        let location = self.absolute(location_header(&started)?);

        let hashed = Arc::new(Mutex::new((Sha256::new(), 0u64)));
        let observer = hashed.clone();
        let stream = ReceiverStream::new(chunks).map(move |chunk| {
            if let Ok(bytes) = &chunk {
                let mut state = observer.lock().unwrap();
                state.0.update(bytes);
                state.1 += bytes.len() as u64;
            }
            chunk
        });
        // No overall timeout: a layer can take minutes to stream.
        let patched = check(
            REGISTRY_HTTP
                .patch(&location)
                .basic_auth(&self.credentials.username, Some(&self.credentials.password))
                .header("Content-Type", "application/octet-stream")
                .body(Body::wrap_stream(stream))
                .send()
                .await?,
        )
        .await?;
        let location = self.absolute(location_header(&patched)?);

        let (hasher, size) = std::mem::take(&mut *hashed.lock().unwrap());
        let digest = format!("sha256:{}", hex::encode(hasher.finalize()));
        let separator = if location.contains('?') { '&' } else { '?' };
        check(
            self.request(REGISTRY_HTTP.put(format!("{location}{separator}digest={digest}")))
                .send()
                .await?,
        )
        .await?;
        Ok(Blob { digest, size })
    }

    pub async fn upload_bytes(&self, content: Bytes) -> Result<Blob> {
        let (tx, rx) = mpsc::channel(1);
        tx.send(Ok(content)).await.ok();
        drop(tx);
        self.upload_blob(rx).await
    }

    /// Tags are derived from the manifest digest, so an existing tag already holds
    /// this manifest and is left alone. Registries with immutable tags answer a
    /// second push with 412, e.g. a concurrent push of the same image landing
    /// between the check and the put; that counts as success too.
    pub async fn put_manifest(&self, digest: &str, manifest: Bytes) -> Result<()> {
        let url = self.url(&format!("manifests/{}", image_tag(digest)));
        let existing = self
            .request(REGISTRY_HTTP.head(&url))
            .header("Accept", MANIFEST_MEDIA_TYPE)
            .send()
            .await?;
        match existing.status() {
            StatusCode::OK => return Ok(()),
            StatusCode::NOT_FOUND => {}
            status => bail!("Registry manifest check returned {status}"),
        }
        let response = self
            .request(REGISTRY_HTTP.put(&url))
            .header("Content-Type", MANIFEST_MEDIA_TYPE)
            .body(manifest)
            .send()
            .await?;
        if response.status() == StatusCode::PRECONDITION_FAILED {
            return Ok(());
        }
        check(response).await?;
        Ok(())
    }

    fn request(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        builder
            .basic_auth(&self.credentials.username, Some(&self.credentials.password))
            .timeout(REQUEST_TIMEOUT)
    }

    fn base(&self) -> String {
        format!("https://{}", self.credentials.host)
    }

    fn url(&self, path: &str) -> String {
        format!("{}/v2/{}/{path}", self.base(), self.name)
    }

    /// Upload URLs come back absolute or host-relative.
    fn absolute(&self, location: &str) -> String {
        if location.starts_with('/') {
            format!("{}{location}", self.base())
        } else {
            location.to_string()
        }
    }
}

fn image_tag(digest: &str) -> String {
    digest.replace(':', "-")
}

fn location_header(response: &Response) -> Result<&str> {
    response
        .headers()
        .get("Location")
        .context("Registry response has no Location header")?
        .to_str()
        .map_err(|e| anyhow!("Invalid registry Location header: {e}"))
}

async fn check(response: Response) -> Result<Response> {
    let status = response.status();
    if !status.is_success() {
        bail!(
            "Registry returned {status}: {}",
            response.text().await.unwrap_or_default()
        );
    }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags_are_digests() {
        let digest = format!("sha256:{}", "b".repeat(64));
        assert_eq!(image_tag(&digest), format!("sha256-{}", "b".repeat(64)));
    }

    #[test]
    fn pushed_images_live_in_the_project_repository() {
        let registry = ImageRegistry::Generic(RegistryCredentials {
            host: "registry.example.com".to_string(),
            username: "u".to_string(),
            password: "p".to_string(),
        });
        let repository = Repository {
            registry: &registry,
            credentials: match &registry {
                ImageRegistry::Generic(c) => c.clone(),
                ImageRegistry::Ecr(_) => unreachable!(),
            },
            name: format!("lmnr-hosted-evals/{}", Uuid::nil()),
        };
        let digest = format!("sha256:{}", "c".repeat(64));
        let image = repository.pushed_image(&digest);
        assert_eq!(
            image.reference,
            format!(
                "registry.example.com/lmnr-hosted-evals/{}:sha256-{}",
                Uuid::nil(),
                "c".repeat(64)
            )
        );
        assert_eq!(image.registry.host, "registry.example.com");
    }
}
