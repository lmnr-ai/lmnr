//! Quickwit full-text search endpoints + index id.

use super::StringEnv;

pub const SPANS_INDEX_ID: StringEnv = StringEnv::new("QUICKWIT_SPANS_INDEX_ID", "spans_v2");
pub const INGEST_URL: StringEnv = StringEnv::new("QUICKWIT_INGEST_URL", "http://localhost:7281");
pub const SEARCH_URL: StringEnv = StringEnv::new("QUICKWIT_SEARCH_URL", "http://localhost:7280");
