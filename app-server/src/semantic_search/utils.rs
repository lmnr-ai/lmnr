use anyhow::Result;
use serde::{
    ser::{SerializeStruct, Serializer},
    Serialize,
};

use super::semantic_search_grpc::query_response::QueryPoint;

impl Serialize for QueryPoint {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("QueryPoint", 4)?;
        state.serialize_field("score", &self.score)?;
        state.serialize_field("content", &self.content)?;
        state.serialize_field("datasource_id", &self.datasource_id)?;
        state.serialize_field("data", &self.data)?;
        state.end()
    }
}
