use std::{collections::HashMap, result::Result, sync::Arc};

use crate::{pipeline::nodes::NodeInput, routes::error::Error, semantic_search::SemanticSearch};
use actix_multipart::Multipart;
use anyhow::Context;
use futures_util::StreamExt;

use super::datapoints::Datapoint;

pub async fn read_multipart_file(mut payload: Multipart) -> Result<(String, bool, Vec<u8>), Error> {
    let mut filename = String::new();
    let mut is_unstructured_file = false;
    let mut bytes = Vec::new();

    while let Some(item) = payload.next().await {
        let mut field = item?;
        let content = field.content_disposition();
        let name = content.get_name().unwrap();

        if name == "file" {
            // This does not handle filename_ext ("filename*")
            filename = content
                .get_filename()
                .context("filename not found")?
                .to_owned();

            while let Some(item) = field.next().await {
                let item = item?;
                bytes.extend_from_slice(&item);
            }
        } else if name == "isUnstructuredFile" {
            let mut value = vec![];
            while let Some(chunk) = field.next().await {
                let data = chunk?;
                value.extend_from_slice(&data);
            }
            let value = String::from_utf8(value).unwrap();

            is_unstructured_file = value.parse::<bool>().unwrap();
        }
    }

    Ok((filename, is_unstructured_file, bytes))
}

pub async fn index_new_points(
    datapoints: Vec<Datapoint>,
    semantic_search: Arc<dyn SemanticSearch>,
    collection_name: String,
    new_index_column: Option<String>,
) -> anyhow::Result<()> {
    if let Some(index_column) = &new_index_column {
        let indexable_datapoints = datapoints.iter().filter(|datapoint| {
            serde_json::from_value::<HashMap<String, NodeInput>>(datapoint.data.clone())
                .is_ok_and(|data| data.contains_key(index_column))
        });

        let vector_db_datapoints = indexable_datapoints
            .clone()
            .map(|datapoint| datapoint.into_vector_db_datapoint(index_column))
            .collect::<Vec<_>>();

        if !vector_db_datapoints.is_empty() {
            semantic_search
                .index(vector_db_datapoints, collection_name)
                .await?;
        }
    }
    Ok(())
}
