use actix_multipart::Multipart;
use actix_web::{post, web, HttpResponse};
use uuid::Uuid;

use crate::{
    datasets::{
        datapoints,
        utils::{read_multipart_file, ParsedFile},
    },
    db::DB,
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
) -> ResponseResult {
    let (_, dataset_id) = path.into_inner();
    let db = db.into_inner();

    let ParsedFile { filename, bytes } = read_multipart_file(payload).await?;

    let datapoints =
        datapoints::insert_datapoints_from_file(&bytes, &filename, dataset_id, db.clone()).await?;

    Ok(HttpResponse::Ok().json(datapoints))
}
