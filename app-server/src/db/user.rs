use anyhow::Result;
use log::error;
use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Serialize, FromRow)]
pub struct UserInfo {
    pub id: Uuid,
    pub name: String,
    pub email: String,
}

#[derive(Default, Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub name: String,
    pub email: String,
}

pub async fn write_user(pool: &PgPool, id: &Uuid, email: &String, name: &String) -> Result<()> {
    sqlx::query("INSERT INTO users (id, name, email) values ($1, $2, $3)")
        .bind(id)
        .bind(name)
        .bind(email)
        .execute(pool)
        .await?;

    Ok(())
}

#[derive(Debug, Deserialize, Serialize, Clone, FromRow)]
pub struct ApiKey {
    pub api_key: String,
    pub user_id: Uuid,
    pub name: String,
}

pub async fn write_api_key(
    pool: &PgPool,
    api_key: &String,
    user_id: &Uuid,
    name: &String,
) -> Result<()> {
    sqlx::query("INSERT INTO api_keys (api_key, user_id, name) values ($1, $2, $3)")
        .bind(api_key)
        .bind(user_id)
        .bind(name)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn get_user_from_api_key(pool: &PgPool, api_key: String) -> Result<User> {
    match sqlx::query_as::<_, User>(
        "
        SELECT
            u.id as id,
            u.name as name,
            u.email as email
        FROM
            users u
            left join api_keys ak on u.id = ak.user_id
        WHERE
            ak.api_key = $1
        GROUP BY
            u.id,
            u.name,
            u.email,
            ak.api_key",
    )
    .bind(&api_key)
    .fetch_optional(pool)
    .await
    {
        Ok(Some(user)) => Ok(user),
        Ok(None) => Err(anyhow::anyhow!("No user found for api key")),
        Err(e) => Err(e.into()),
    }
}

pub async fn get_api_key_for_user_from_email(pool: &PgPool, email: &String) -> Option<String> {
    match sqlx::query_as::<_, ApiKey>(
        "SELECT api_key, user_id, name
        FROM api_keys
        WHERE user_id = (SELECT id FROM users WHERE email = $1)",
    )
    .bind(email)
    .fetch_optional(pool)
    .await
    {
        Ok(Some(api_key)) => Some(api_key.api_key),
        Ok(None) => None,
        Err(e) => {
            error!("Error getting api key for user from email: {}", e);
            None
        }
    }
}
