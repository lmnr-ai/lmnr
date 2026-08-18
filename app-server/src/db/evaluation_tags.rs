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

/// Attach tags to an evaluation's `tags` array, registering any unknown tag
/// class first so the name resolves to a color in the UI pickers. Returns the
/// evaluation's full tag list, or `None` when it isn't in the project.
pub async fn add_evaluation_tags(
    pool: &PgPool,
    project_id: Uuid,
    evaluation_id: Uuid,
    names: &[String],
) -> Result<Option<Vec<String>>> {
    let mut tx = pool.begin().await?;

    // The evaluation UPDATE runs FIRST so a bad id can't leave new tag classes
    // behind in the project's shared picker: no row matched ⇒ return before the
    // registry insert, and the dropped transaction rolls back.
    // Append only the names not already attached, so re-tagging is idempotent
    // and existing order is preserved. `names` is deduped by the caller.
    let tags = sqlx::query_scalar::<_, Vec<String>>(
        "UPDATE evaluations
        SET tags = tags || (
            SELECT COALESCE(array_agg(n ORDER BY ord), '{}')
            FROM UNNEST($3::text[]) WITH ORDINALITY AS incoming(n, ord)
            WHERE NOT tags @> ARRAY[n]
        )
        WHERE id = $1 AND project_id = $2
        RETURNING tags",
    )
    .bind(evaluation_id)
    .bind(project_id)
    .bind(names)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(tags) = tags else {
        return Ok(None);
    };

    let colors: Vec<&str> = names.iter().map(|name| color_for_tag(name)).collect();
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

    tx.commit().await?;

    Ok(Some(tags))
}

/// Detach a tag from an evaluation. Returns the remaining tag list, or `None`
/// when the evaluation isn't in the project.
pub async fn remove_evaluation_tag(
    pool: &PgPool,
    project_id: Uuid,
    evaluation_id: Uuid,
    name: &str,
) -> Result<Option<Vec<String>>> {
    let tags = sqlx::query_scalar::<_, Vec<String>>(
        "UPDATE evaluations
        SET tags = array_remove(tags, $3)
        WHERE id = $1 AND project_id = $2
        RETURNING tags",
    )
    .bind(evaluation_id)
    .bind(project_id)
    .bind(name)
    .fetch_optional(pool)
    .await?;

    Ok(tags)
}
