use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn get_event_definition_names(pool: &PgPool, project_id: &Uuid) -> Result<Vec<String>> {
    let event_definitions =
        sqlx::query_scalar::<_, String>("SELECT name FROM event_definitions WHERE project_id = $1")
            .bind(project_id)
            .fetch_all(pool)
            .await?;

    Ok(event_definitions)
}

pub async fn insert_event_definition_names(
    pool: &PgPool,
    project_id: &Uuid,
    names: &Vec<String>,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO event_definitions (name, project_id)
        SELECT UNNEST($1::text[]) AS name, $2 AS project_id
        ON CONFLICT (name, project_id) DO NOTHING
        ",
    )
    .bind(names)
    .bind(project_id)
    .execute(pool)
    .await?;

    Ok(())
}
