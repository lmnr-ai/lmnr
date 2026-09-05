use super::*;
use serde_json::{Value, json};
use wiremock::{Mock, MockServer, ResponseTemplate, matchers::method};

#[tokio::test]
async fn sends_large_values_in_body_not_sql() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&server)
        .await;
    let client = Client::default()
        .with_url(server.uri())
        .with_compression(clickhouse::Compression::None);
    let output = "payload-only-marker: '\"\\\n雪🦀".repeat(40_000);
    let scores = json!({"score-only-marker": 0.5}).to_string();
    let update = Update {
        trace_id: Uuid::new_v4(),
        updated_at: 1_700_000_000_000_000_123,
        executor_output: &output,
        group_id: "group-only-marker'; SELECT 1; --",
        scores: &scores,
    };
    write(
        &client,
        Uuid::new_v4(),
        Uuid::new_v4(),
        Uuid::new_v4(),
        &update,
    )
    .await
    .unwrap();

    let requests = server.received_requests().await.unwrap();
    let request = &requests[0];
    let query = request
        .url
        .query_pairs()
        .find(|(k, _)| k == "query")
        .unwrap()
        .1;
    assert!(query.len() < 4096);
    assert!(request.url.as_str().len() < 8192);
    assert!(!query.contains("only-marker"));
    assert!(
        !request
            .url
            .query_pairs()
            .any(|(k, _)| k == "max_query_size")
    );
    assert!(query.ends_with("FORMAT JSONEachRow"));
    assert_eq!(
        serde_json::from_slice::<Value>(&request.body).unwrap(),
        json!(update)
    );
}

#[tokio::test]
async fn propagates_clickhouse_write_failure() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(500).set_body_string("synthetic write failure"))
        .expect(1)
        .mount(&server)
        .await;
    let client = Client::default().with_url(server.uri());
    let error = write(
        &client,
        Uuid::new_v4(),
        Uuid::new_v4(),
        Uuid::new_v4(),
        &Update {
            trace_id: Uuid::nil(),
            updated_at: 1,
            executor_output: "output",
            group_id: "default",
            scores: "",
        },
    )
    .await
    .unwrap_err();
    let message = error.to_string();
    assert!(message.contains("Clickhouse evaluation datapoint update failed"));
    assert!(message.contains("synthetic write failure"));
}

async fn rows(client: &Client) -> Result<Vec<Value>> {
    let bytes = client
        .query("SELECT * FROM evaluation_datapoints FINAL ORDER BY project_id, evaluation_id, id")
        .fetch_bytes("JSONEachRow")?
        .collect()
        .await?;
    serde_json::Deserializer::from_slice(&bytes)
        .into_iter::<Value>()
        .map(|row| row.map_err(Into::into))
        .collect()
}

// docker run --rm -p 127.0.0.1:18123:8123 -e CLICKHOUSE_SKIP_USER_SETUP=1 clickhouse/clickhouse-server:26.5
// cargo test evaluations::datapoint_update::tests::large_update_round_trip -- --ignored --nocapture
#[tokio::test]
#[ignore = "requires disposable ClickHouse on 127.0.0.1:18123"]
async fn large_update_round_trip() -> Result<()> {
    let root = Client::default().with_url("http://127.0.0.1:18123");
    let database = format!("eval_update_test_{}", Uuid::new_v4().simple());
    root.query(&format!("CREATE DATABASE {database}"))
        .execute()
        .await?;
    let client = root.clone().with_database(&database);
    // Mirrors migration 32; backend-only Docker builds do not contain frontend migrations.
    client
        .query(
            "CREATE TABLE evaluation_datapoints (
                id UUID, evaluation_id UUID, project_id UUID, trace_id UUID,
                updated_at DateTime64(9, 'UTC'),
                data String, target String, metadata String, executor_output String,
                `index` UInt64, dataset_id UUID, dataset_datapoint_id UUID,
                dataset_datapoint_created_at DateTime64(9, 'UTC'), group_id String, scores String
            ) ENGINE = ReplacingMergeTree(updated_at)
            ORDER BY (project_id, evaluation_id, id)",
        )
        .execute()
        .await?;
    let project = Uuid::new_v4();
    let evaluation = Uuid::new_v4();
    let id = Uuid::new_v4();
    let original_trace = Uuid::new_v4();
    let seed = json!({
        "id": id, "evaluation_id": evaluation, "project_id": project,
        "trace_id": original_trace, "updated_at": "2026-01-01 00:00:00.000000001",
        "data": "original data", "target": "original target", "metadata": "original metadata",
        "executor_output": "original output", "index": 7,
        "dataset_id": Uuid::new_v4(), "dataset_datapoint_id": Uuid::new_v4(),
        "dataset_datapoint_created_at": "2025-01-01 00:00:00.123456789",
        "group_id": "default", "scores": "{\"existing\":0.75,\"replace\":0.1}"
    });
    let mut other_project = seed.clone();
    other_project["project_id"] = json!(Uuid::new_v4());
    let mut other_evaluation = seed.clone();
    other_evaluation["evaluation_id"] = json!(Uuid::new_v4());
    let body = [seed.clone(), other_project, other_evaluation]
        .iter()
        .map(Value::to_string)
        .collect::<Vec<_>>()
        .join("\n");
    let mut insert =
        client.insert_formatted_with("INSERT INTO evaluation_datapoints FORMAT JSONEachRow");
    insert.send(body.into()).await?;
    insert.end().await?;
    let before = rows(&client).await?;

    // The previous two literal binds fail even below the old 250,000-byte truncation.
    let output = "x".repeat(200_000);
    let error = client
        .query("SELECT if(empty(?), 'old', ?)")
        .bind(&output)
        .bind(&output)
        .execute()
        .await
        .unwrap_err();
    assert!(error.to_string().contains("Max query size exceeded"));

    let mut update = Update {
        trace_id: Uuid::nil(),
        updated_at: 1_800_000_000_000_000_001,
        executor_output: &output,
        group_id: "default",
        scores: "",
    };
    write(&client, evaluation, project, id, &update).await?;
    let current = rows(&client).await?;
    let current = current
        .iter()
        .find(|r| r["project_id"] == json!(project) && r["evaluation_id"] == json!(evaluation))
        .unwrap();
    assert_eq!(current["executor_output"], output);
    assert_eq!(current["trace_id"], json!(original_trace));

    let large_output = json!({"result": "'\"\\\n雪🦀".repeat(200_000)}).to_string();
    assert!(large_output.len() > 2_000_000);
    let large_scores = json!({"replace": 0.9, "new": 0.5, "s".repeat(300_000): 0.25}).to_string();
    update.trace_id = Uuid::new_v4();
    update.updated_at += 1;
    update.executor_output = &large_output;
    update.group_id = "updated'; SELECT 1; --";
    update.scores = &large_scores;
    write(&client, evaluation, project, id, &update).await?;
    // An identical retry must leave the logical row unchanged.
    write(&client, evaluation, project, id, &update).await?;
    let after = rows(&client).await?;
    assert_eq!(after.len(), before.len());
    for (old, new) in before.iter().zip(&after) {
        if old["project_id"] != json!(project) || old["evaluation_id"] != json!(evaluation) {
            assert_eq!(new, old);
            continue;
        }
        for field in [
            "id",
            "project_id",
            "evaluation_id",
            "data",
            "target",
            "metadata",
            "index",
            "dataset_id",
            "dataset_datapoint_id",
            "dataset_datapoint_created_at",
        ] {
            assert_eq!(new[field], old[field], "changed {field}");
        }
        assert_eq!(new["executor_output"], large_output);
        assert_eq!(
            serde_json::from_str::<Value>(new["executor_output"].as_str().unwrap())?["result"],
            serde_json::from_str::<Value>(&large_output)?["result"]
        );
        assert_eq!(new["trace_id"], json!(update.trace_id));
        assert_eq!(new["group_id"], update.group_id);
        let scores: Value = serde_json::from_str(new["scores"].as_str().unwrap())?;
        assert_eq!(scores["existing"], 0.75);
        assert_eq!(scores["replace"], 0.9);
        assert_eq!(scores["new"], 0.5);
        assert_eq!(scores["s".repeat(300_000)], 0.25);
    }

    update.updated_at += 1;
    update.trace_id = Uuid::nil();
    update.executor_output = "";
    update.scores = "{\"later\":1}";
    write(&client, evaluation, project, id, &update).await?;
    update.updated_at += 1;
    update.scores = "";
    write(&client, evaluation, project, id, &update).await?;
    let final_rows = rows(&client).await?;
    let final_row = final_rows
        .iter()
        .find(|r| r["project_id"] == json!(project) && r["evaluation_id"] == json!(evaluation))
        .unwrap();
    let previous = after
        .iter()
        .find(|r| r["project_id"] == json!(project) && r["evaluation_id"] == json!(evaluation))
        .unwrap();
    assert_eq!(final_row["executor_output"], large_output);
    assert_eq!(final_row["trace_id"], previous["trace_id"]);
    let scores: Value = serde_json::from_str(final_row["scores"].as_str().unwrap())?;
    assert_eq!(scores["later"], 1);
    assert_eq!(scores["existing"], 0.75);
    assert_eq!(scores["replace"], 0.9);

    write(&client, evaluation, project, Uuid::new_v4(), &update).await?;
    assert_eq!(rows(&client).await?, final_rows);
    root.query(&format!("DROP DATABASE {database}"))
        .execute()
        .await?;
    Ok(())
}
