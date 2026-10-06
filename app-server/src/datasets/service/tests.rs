use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};

use actix_web::{body::to_bytes, http::StatusCode};
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;
use wiremock::matchers::method;
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

use crate::{api::v1::datasets::handlers, db::DB};

// Run with `cargo test --bin app-server dataset_delete_retries -- --ignored`.
// The connection points only to the disposable local container; all SQL below
// touches a session-local temporary table that shadows the application table.
#[actix_web::test]
#[ignore = "requires the isolated lmnr-issue-2402-pg PostgreSQL container on port 25402"]
async fn dataset_delete_retries_clickhouse_after_postgres_row_is_gone() {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect("postgres://postgres:dataset-delete-test@127.0.0.1:25402/postgres")
        .await
        .expect("connect to isolated PostgreSQL");
    sqlx::query(
        "CREATE TEMP TABLE datasets (
            id UUID PRIMARY KEY,
            name TEXT NOT NULL,
            project_id UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )",
    )
    .execute(&pool)
    .await
    .expect("create session-local dataset table");

    let db = DB { pool };
    let project_id = Uuid::new_v4();
    let other_project_id = Uuid::new_v4();
    let dataset_id = Uuid::new_v4();
    let other_dataset_id = Uuid::new_v4();
    let unknown_dataset_id = Uuid::new_v4();
    for (id, project, name) in [
        (dataset_id, project_id, "retry target"),
        (other_dataset_id, other_project_id, "other project"),
    ] {
        sqlx::query("INSERT INTO datasets (id, name, project_id) VALUES ($1, $2, $3)")
            .bind(id)
            .bind(name)
            .bind(project)
            .execute(&db.pool)
            .await
            .expect("insert disposable dataset metadata");
    }

    let clickhouse_server = MockServer::start().await;
    let attempts = Arc::new(AtomicUsize::new(0));
    let attempts_for_response = attempts.clone();
    let datapoints = Arc::new(Mutex::new(vec![
        (project_id, dataset_id),
        (other_project_id, other_dataset_id),
    ]));
    let datapoints_for_response = datapoints.clone();
    Mock::given(method("POST"))
        .respond_with(move |request: &Request| {
            if attempts_for_response.fetch_add(1, Ordering::SeqCst) == 0 {
                ResponseTemplate::new(503).set_body_string("ClickHouse unavailable")
            } else {
                let sql = String::from_utf8_lossy(&request.body);
                datapoints_for_response
                    .lock()
                    .unwrap()
                    .retain(|(project, dataset)| {
                        !(sql.contains(&project.to_string()) && sql.contains(&dataset.to_string()))
                    });
                ResponseTemplate::new(200)
            }
        })
        .mount(&clickhouse_server)
        .await;
    let clickhouse = clickhouse::Client::default().with_url(clickhouse_server.uri());

    let first = handlers::delete(&db, &clickhouse, project_id, dataset_id).await;
    assert_eq!(first.status(), StatusCode::INTERNAL_SERVER_ERROR);
    let remaining: i64 = sqlx::query_scalar("SELECT count(*) FROM datasets WHERE id = $1")
        .bind(dataset_id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(remaining, 0, "Postgres deletion committed before CH failed");
    assert!(
        datapoints
            .lock()
            .unwrap()
            .contains(&(project_id, dataset_id)),
        "failed ClickHouse mutation must leave the datapoint for retry"
    );

    let retry = handlers::delete(&db, &clickhouse, project_id, dataset_id).await;
    assert_eq!(retry.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        attempts.load(Ordering::SeqCst),
        2,
        "retry must issue the ClickHouse deletion despite missing Postgres metadata"
    );
    assert!(
        !datapoints
            .lock()
            .unwrap()
            .contains(&(project_id, dataset_id)),
        "retry must clear the matching ClickHouse datapoint"
    );

    let unknown = handlers::delete(&db, &clickhouse, project_id, unknown_dataset_id).await;
    assert_eq!(unknown.status(), StatusCode::NOT_FOUND);
    assert_eq!(attempts.load(Ordering::SeqCst), 3);

    let other_project = handlers::delete(&db, &clickhouse, project_id, other_dataset_id).await;
    assert_eq!(other_project.status(), StatusCode::NOT_FOUND);
    let other_still_exists: i64 =
        sqlx::query_scalar("SELECT count(*) FROM datasets WHERE id = $1 AND project_id = $2")
            .bind(other_dataset_id)
            .bind(other_project_id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(other_still_exists, 1, "other project's row must remain");
    assert!(
        datapoints
            .lock()
            .unwrap()
            .contains(&(other_project_id, other_dataset_id)),
        "other project's ClickHouse datapoint must remain"
    );

    let valid_other_project =
        handlers::delete(&db, &clickhouse, other_project_id, other_dataset_id).await;
    assert_eq!(valid_other_project.status(), StatusCode::OK);
    let body: Value =
        serde_json::from_slice(&to_bytes(valid_other_project.into_body()).await.unwrap())
            .expect("dataset metadata JSON");
    assert_eq!(body["id"], json!(other_dataset_id));
    assert_eq!(body["projectId"], json!(other_project_id));
    assert_eq!(body["name"], "other project");
    assert!(datapoints.lock().unwrap().is_empty());

    let requests = clickhouse_server.received_requests().await.unwrap();
    assert_eq!(requests.len(), 5);
    for (request, (project, dataset)) in requests.iter().zip([
        (project_id, dataset_id),
        (project_id, dataset_id),
        (project_id, unknown_dataset_id),
        (project_id, other_dataset_id),
        (other_project_id, other_dataset_id),
    ]) {
        let sql = String::from_utf8_lossy(&request.body);
        assert!(sql.contains("DELETE FROM dataset_datapoints"), "{sql}");
        assert!(
            sql.contains("project_id =") && sql.contains("dataset_id ="),
            "{sql}"
        );
        assert!(
            sql.contains(&project.to_string()),
            "missing project scope: {sql}"
        );
        assert!(
            sql.contains(&dataset.to_string()),
            "missing dataset id: {sql}"
        );
    }

    let failed_clickhouse = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(503))
        .mount(&failed_clickhouse)
        .await;
    let unavailable = clickhouse::Client::default().with_url(failed_clickhouse.uri());
    let unknown_during_outage =
        handlers::delete(&db, &unavailable, project_id, unknown_dataset_id).await;
    assert_eq!(
        unknown_during_outage.status(),
        StatusCode::INTERNAL_SERVER_ERROR
    );
    assert_eq!(
        failed_clickhouse.received_requests().await.unwrap().len(),
        1
    );
}
