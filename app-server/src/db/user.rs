use anyhow::Result;
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


#[derive(Debug, Deserialize, Serialize, Clone, FromRow)]
pub struct ApiKey {
    pub api_key: String,
    pub user_id: Uuid,
    pub name: String,
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

