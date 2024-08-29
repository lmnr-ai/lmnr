use std::collections::HashMap;

use anyhow::Result;
use enum_dispatch::enum_dispatch;

use super::character_split::{CharacterSplitChunker, CharacterSplitParams};

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum ChunkerType {
    CharacterSplit,
}

#[derive(Clone, Debug)]
pub enum ChunkParams {
    CharacterSplit(CharacterSplitParams),
}

#[derive(Clone, Debug)]
#[enum_dispatch]
pub enum Chunker {
    CharacterSplit(CharacterSplitChunker),
}

#[enum_dispatch(Chunker)]
pub trait Chunk {
    fn chunk(&self, text: &str, params: &ChunkParams) -> Result<Vec<String>>;
}

#[derive(Debug)]
pub struct ChunkerRunner {
    chunkers: HashMap<ChunkerType, Chunker>,
}

impl ChunkerRunner {
    pub fn new(chunkers: HashMap<ChunkerType, Chunker>) -> Self {
        Self { chunkers }
    }

    pub fn chunk(
        &self,
        chunker_type: &ChunkerType,
        text: &str,
        params: &ChunkParams,
    ) -> Result<Vec<String>> {
        let chunker = self
            .chunkers
            .get(&chunker_type)
            .ok_or(anyhow::anyhow!("Invalid chunker type"))?;
        chunker.chunk(text, params)
    }
}
