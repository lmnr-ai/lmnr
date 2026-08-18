use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

/// Mirrors the frontend palette (`frontend/lib/tags/colors.ts`) so a tag class
/// registered from the API looks the same as one created in the UI. Picked by a
/// hash of the name so repeated CLI runs stay stable.
const TAG_COLORS: [&str; 9] = [
    "rgb(190, 194, 200)",
    "rgb(149, 162, 179)",
    "lch(48 59.31 288.43)",
    "rgb(38, 181, 206)",
    "rgb(76, 183, 130)",
    "lch(80 90 85)",
    "rgb(242, 153, 74)",
    "rgb(247, 200, 193)",
    "rgb(235, 87, 87)",
];

fn color_for_tag(name: &str) -> &'static str {
    let hash = name
        .bytes()
        .fold(0u32, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u32));
    TAG_COLORS[hash as usize % TAG_COLORS.len()]
}

pub async fn get_evaluation_tags(
    pool: &PgPool,
    project_id: Uuid,
    evaluation_id: Uuid,
) -> Result<Vec<String>> {
    let tags = sqlx::query_scalar::<_, String>(
        "SELECT name
        FROM evaluation_tags
        WHERE project_id = $1 AND evaluation_id = $2
        ORDER BY created_at",
    )
    .bind(project_id)
    .bind(evaluation_id)
    .fetch_all(pool)
    .await?;

    Ok(tags)
}

/// Attach tags to an evaluation, registering any unknown tag class first —
/// `evaluation_tags` has a composite FK onto `tag_classes(name, project_id)`.
/// Returns the evaluation's full tag list.
pub async fn add_evaluation_tags(
    pool: &PgPool,
    project_id: Uuid,
    evaluation_id: Uuid,
    names: &[String],
) -> Result<Vec<String>> {
    let colors: Vec<&str> = names.iter().map(|name| color_for_tag(name)).collect();

    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO tag_classes (name, project_id, color)
        SELECT n, $2, c FROM UNNEST($1::text[], $3::text[]) AS t(n, c)
        ON CONFLICT (name, project_id) DO NOTHING",
    )
    .bind(names)
    .bind(project_id)
    .bind(&colors)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO evaluation_tags (evaluation_id, project_id, name)
        SELECT $1, $2, n FROM UNNEST($3::text[]) AS t(n)
        ON CONFLICT (evaluation_id, name) DO NOTHING",
    )
    .bind(evaluation_id)
    .bind(project_id)
    .bind(names)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_evaluation_tags(pool, project_id, evaluation_id).await
}

/// Detach a tag from an evaluation. Returns the remaining tag list.
pub async fn remove_evaluation_tag(
    pool: &PgPool,
    project_id: Uuid,
    evaluation_id: Uuid,
    name: &str,
) -> Result<Vec<String>> {
    sqlx::query(
        "DELETE FROM evaluation_tags
        WHERE project_id = $1 AND evaluation_id = $2 AND name = $3",
    )
    .bind(project_id)
    .bind(evaluation_id)
    .bind(name)
    .execute(pool)
    .await?;

    get_evaluation_tags(pool, project_id, evaluation_id).await
}
