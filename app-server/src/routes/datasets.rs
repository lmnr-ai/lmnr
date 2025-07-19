use actix_multipart::Multipart;
use actix_web::{HttpResponse, post, web};
use uuid::Uuid;

use crate::{
    ch::{self, datapoints::CHDatapoint},
    datasets::{
        datapoints::{self, read_bytes_csv, read_bytes_json, read_bytes_jsonl},
        utils::{ParsedFile, read_multipart_file},
    },
    db::{DB, datapoints::DBDatapoint, datasets},
    routes::ResponseResult,
};

// NOTE: this endpoint currently assumes one file upload.
// If we want to support multiple files, we will need to keep a list of filename -> bytes links.
// and potentially batch process, so that we don't hold enormous files in memory
#[post("datasets/{dataset_id}/file-upload")]
async fn upload_datapoint_file(
    payload: Multipart,
    path: web::Path<(Uuid, Uuid)>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let (project_id, dataset_id) = path.into_inner();
    let db = db.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();

    let ParsedFile { filename, bytes } = read_multipart_file(payload).await?;

    // Parse the file data
    let mut records = None;
    let extension = filename.split(".").last().unwrap_or_default();
    if extension == "jsonl" {
        records = Some(read_bytes_jsonl(&bytes)?);
    } else if extension == "json" {
        records = Some(read_bytes_json(&bytes)?);
    } else if extension == "csv" {
        records = Some(read_bytes_csv(&bytes)?);
    }

    if let Some(data) = records {
        // Insert datapoints into PostgreSQL and get DBDatapoint
        let db_datapoints =
            crate::db::datapoints::insert_raw_data(&db.pool, &dataset_id, &data).await?;

        // Get dataset information for ClickHouse
        let dataset = datasets::get_dataset_by_id(&db.pool, dataset_id).await?;

        if let Some(dataset) = dataset {
            // Convert to ClickHouse format and insert
            let ch_datapoints: Vec<CHDatapoint> = db_datapoints
                .iter()
                .map(|db_dp| {
                    CHDatapoint::from_db_datapoint(db_dp, dataset.name.clone(), project_id)
                })
                .collect();

            if let Err(e) =
                ch::datapoints::insert_datapoints_batch(clickhouse, &ch_datapoints).await
            {
                log::error!("Failed to insert datapoints to ClickHouse: {:?}", e);
                // Don't fail the request if ClickHouse insertion fails
            }
        }

        // Convert back to the expected format for response
        let response_datapoints: Vec<datapoints::Datapoint> = db_datapoints
            .into_iter()
            .map(|db_dp| db_dp.into())
            .collect();

        Ok(HttpResponse::Ok().json(response_datapoints))
    } else {
        Err(anyhow::anyhow!(
            "Attempting to process file as unstructured even though requested as structured"
        )
        .into())
    }
}
