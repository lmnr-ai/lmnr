use anyhow::Result;
use itertools::Itertools;

use log::error;
use rayon::prelude::*;
use reqwest::{
    multipart::{Form, Part},
    Client,
};
use std::{collections::HashMap, env, sync::Arc};
use uuid::Uuid;

use crate::chunk::{
    character_split::CharacterSplitParams,
    runner::{ChunkParams, ChunkerRunner, ChunkerType},
};
use crate::semantic_search::semantic_search_grpc::index_request::Datapoint;

const CHARACTER_SPLITTER_CHUNK_SIZE: u32 = 512;
const CHARACTER_SPLITTER_STRIDE: u32 = 256;

struct FilePage {
    // Page number in file which starts from 1
    page_number: i32,
    page_content: String,
}

/// File manager is extracts structured data from file, chunks it, and indexes it in the semantic search
#[derive(Clone)]
pub struct FileManager {
    /// http client to call `unstructured`
    client: reqwest::Client,
    chunker_runner: Arc<ChunkerRunner>,
}

/// Unstructured object metadata
#[derive(Debug, serde::Deserialize, serde::Serialize)]
struct ParsedObjectMetadata {
    page_number: Option<i32>,
}

/// Unstructured single parsed object
#[derive(Debug, serde::Deserialize, serde::Serialize)]
struct ParsedObject {
    element_id: String,
    metadata: ParsedObjectMetadata,
    text: String,
}

impl FileManager {
    pub fn new(client: reqwest::Client, chunker_runner: Arc<ChunkerRunner>) -> Self {
        Self {
            client,
            chunker_runner,
        }
    }

    pub async fn chunk_doc(
        &self,
        bytes: &Vec<u8>,
        filename: &String,
        file_id: Uuid,
    ) -> Result<Vec<Datapoint>> {
        // TODO: other text files, e.g. `.md` must also not be sent to unstructured
        let pages = if filename.ends_with(".txt") {
            let page = FilePage {
                page_number: 1,
                page_content: String::from_utf8_lossy(&bytes).to_string(),
            };

            vec![page]
        } else {
            self.convert_to_pages(self.client.clone(), bytes, filename.clone())
                .await?
        };

        self.pages_to_datapoints(pages, file_id)
    }

    fn pages_to_datapoints(&self, pages: Vec<FilePage>, file_id: Uuid) -> Result<Vec<Datapoint>> {
        let splitter_params = ChunkParams::CharacterSplit(CharacterSplitParams {
            chunk_size: CHARACTER_SPLITTER_CHUNK_SIZE,
            stride: CHARACTER_SPLITTER_STRIDE,
        });

        let datapoints_per_page: Result<Vec<Vec<Datapoint>>> = pages
            .par_iter()
            .map(|page| {
                let chunks_res = self.chunker_runner.chunk(
                    &ChunkerType::CharacterSplit,
                    &page.page_content,
                    &splitter_params,
                );
                if let Err(e) = chunks_res {
                    return Err(anyhow::anyhow!("chunking error: {:?}", e));
                };
                let chunks = chunks_res.unwrap();

                let chunk_datapoints = chunks
                    .into_iter()
                    .map(|chunk| {
                        let mut data = HashMap::new();
                        data.insert("page_number".to_string(), page.page_number.to_string());
                        data.insert("page_content".to_string(), page.page_content.clone());
                        data.insert("content".to_string(), chunk.clone());

                        Datapoint {
                            content: chunk,
                            datasource_id: file_id.to_string(),
                            data,
                            id: Uuid::new_v4().to_string(),
                        }
                    })
                    .collect::<Vec<_>>();

                Ok(chunk_datapoints)
            })
            .collect();

        datapoints_per_page
            .map(|datapoints_per_page| datapoints_per_page.into_iter().flatten().collect())
    }

    // Utilizes Unstructured API to extract structured data from the file's bytes
    async fn convert_to_pages(
        &self,
        client: Client,
        bytes: &Vec<u8>,
        filename: String,
    ) -> Result<Vec<FilePage>> {
        // Create the multipart form data
        let form = Form::new()
            // .text("strategy", "hi_res")
            // .text("skip_infer_table_types", "[]")
            // .text("chunking_strategy", "by_title")
            // .text("UNSTRUCTURED_PARALLEL_MODE_ENABLED", "true")
            .part(
                "files",
                Part::bytes(bytes.to_owned()).file_name(filename.clone()),
            );

        let unstructured_url = env::var("UNSTRUCTURED_URL").expect("UNSTRUCTURED_URL must be set");

        let res = client
            .post(format!("{unstructured_url}/general/v0/general"))
            .multipart(form)
            .send()
            .await?;

        if !res.status().is_success() {
            error!(
                "unstructured server error: {:?} for filename: {}",
                res.text().await?,
                filename
            );
            return Err(anyhow::anyhow!("doc parsing server error"));
        }

        let objs = res.json::<Vec<ParsedObject>>().await?;
        let pages = objs
            .iter()
            // if page number is not present in the metadata, default to 0
            .group_by(|o| o.metadata.page_number.unwrap_or_default())
            .into_iter()
            .map(|(page_number, parsed_pages)| {
                let page_content = parsed_pages
                    .map(|obj| obj.text.trim())
                    .filter(|t| t.trim().len() > 0)
                    .join("\n");
                FilePage {
                    page_number: page_number + 1,
                    page_content,
                }
            })
            .collect::<Vec<_>>();

        Ok(pages)
    }
}
