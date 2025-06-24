use uuid::Uuid;

pub async fn delete_project_data(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
) -> anyhow::Result<()> {
    let tables = [
        "default.spans",
        "default.events",
        "default.evaluation_scores",
        "default.labels",
        "default.browser_session_events",
        "default.evaluator_scores",
    ];

    for table in tables {
        let query = format!("ALTER TABLE {} DELETE WHERE project_id = ?", table);

        if let Err(e) = clickhouse.query(&query).bind(project_id).execute().await {
            log::error!(
                "Failed to delete from ClickHouse table '{}' for project {}: {}",
                table,
                project_id,
                e
            );
            return Err(anyhow::anyhow!(
                "Failed to delete from ClickHouse table '{}': {}",
                table,
                e
            ));
        }
    }

    log::info!("Deleted ClickHouse data for project: {}", project_id);
    Ok(())
}
