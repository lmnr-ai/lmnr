use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
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
