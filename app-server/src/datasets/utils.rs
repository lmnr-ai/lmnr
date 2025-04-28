use crate::routes::error::Error;
use actix_multipart::Multipart;
use anyhow::Context;
use futures_util::StreamExt;

pub struct ParsedFile {
    pub filename: String,
    pub bytes: Vec<u8>,
}

pub async fn read_multipart_file(mut payload: Multipart) -> Result<ParsedFile, Error> {
    let mut filename = String::new();
    let mut bytes = Vec::new();

    while let Some(item) = payload.next().await {
        let mut field = item?;
        let content = field.content_disposition();
        let name = content.unwrap().get_name().unwrap();

        if name == "file" {
            // This does not handle filename_ext ("filename*")
            filename = content
                .unwrap()
                .get_filename()
                .context("filename not found")?
                .to_owned();

            while let Some(item) = field.next().await {
                let item = item?;
                bytes.extend_from_slice(&item);
            }
        }
    }

    Ok(ParsedFile { filename, bytes })
}
