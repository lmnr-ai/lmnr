use serde::{Deserialize, Serialize};

#[derive(sqlx::Type, Serialize, Deserialize, Clone, PartialEq)]
#[sqlx(type_name = "tag_source")]
pub enum TagSource {
    MANUAL,
    AUTO,
    CODE,
}
