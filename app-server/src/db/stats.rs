use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct WorkspaceLimitsExceeded {
    pub steps: bool,
    pub bytes_ingested: bool,
}
