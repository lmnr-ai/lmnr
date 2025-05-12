use actix_web::{HttpResponse, delete, get, web};
use uuid::Uuid;

use crate::{
    db::{self, DB},
    routes::ResponseResult,
};

#[delete("")]
async fn delete_project(project_id: web::Path<Uuid>, db: web::Data<DB>) -> ResponseResult {
    let project_id = project_id.into_inner();

    let project = db::projects::get_project(&db.pool, &project_id).await?;

    db::projects::delete_project(&db.pool, &project_id).await?;
    log::info!(
        "Deleted project: id: {}, name: {}, workspace_id: {}",
        project.id,
        project.name,
        project.workspace_id
    );

    Ok(HttpResponse::Ok().finish())
}
