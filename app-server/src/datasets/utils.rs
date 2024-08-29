use std::result::Result;

use crate::routes::error::Error;
use actix_multipart::Multipart;
use anyhow::Context;
use futures_util::StreamExt;

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
