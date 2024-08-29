use std::cmp::min;

use anyhow::Result;

use super::runner::{Chunk, ChunkParams};

#[derive(Clone, Debug)]
pub struct CharacterSplitParams {
    pub chunk_size: u32,
    pub stride: u32,
}

#[derive(Clone, Debug)]
pub struct CharacterSplitChunker {}

impl Chunk for CharacterSplitChunker {
    fn chunk(&self, text: &str, params: &ChunkParams) -> Result<Vec<String>> {
        let params = match params {
            ChunkParams::CharacterSplit(chunk_splitter_params) => chunk_splitter_params,
            // Throw error if other params are passed, but now there are no other param types
        };
        let chunk_size = params.chunk_size as usize;
        let stride = params.stride as usize;

        if text.is_empty() {
            return Ok(Vec::<String>::new());
        }

        let mut result = Vec::new();
        let mut start = 0;
        let length = text.len();

        // use loop so that we can take at least one chunk even if the chunk size is larger than the text
        loop {
            let end = min(start + (chunk_size), length);
            result.push(
                text.chars()
                    .skip(start)
                    .take(end - start)
                    .collect::<String>(),
            );

            start += stride;
            if start + chunk_size > length {
                break;
            }
        }

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use crate::chunk::character_split::*;

    #[test]
    fn test_character_splitter() {
        let splitter = CharacterSplitChunker {};

        // Test with small chunk size and stride
        let params = ChunkParams::CharacterSplit(CharacterSplitParams {
            chunk_size: 2,
            stride: 1,
        });

        let text = "hello";
        let result = splitter.chunk(text, &params).unwrap();
        assert_eq!(result, vec!["he", "el", "ll", "lo"]);

        let text = "hello#";
        let result = splitter.chunk(text, &params).unwrap();
        assert_eq!(result, vec!["he", "el", "ll", "lo", "o#"]);

        let text = "hello_world";
        let result = splitter.chunk(text, &params).unwrap();
        assert_eq!(
            result,
            vec!["he", "el", "ll", "lo", "o_", "_w", "wo", "or", "rl", "ld"]
        );

        let text = "";
        let result = splitter.chunk(text, &params).unwrap();
        assert_eq!(result, Vec::<String>::new());

        let params = ChunkParams::CharacterSplit(CharacterSplitParams {
            chunk_size: 2,
            stride: 3,
        });
        let text = "hello";
        let result = splitter.chunk(text, &params).unwrap();
        assert_eq!(result, vec!["he", "lo"]);

        // Test with large chunk size and stride

        let params = ChunkParams::CharacterSplit(CharacterSplitParams {
            chunk_size: 1_000_000,
            stride: 1_000_000,
        });
        let text = "hello";
        let result = splitter.chunk(text, &params).unwrap();
        assert_eq!(result, vec!["hello"]);

        // Test with large chunk size and small stride

        let params = ChunkParams::CharacterSplit(CharacterSplitParams {
            chunk_size: 1_000_000,
            stride: 1,
        });
        let text = "hello";
        let result = splitter.chunk(text, &params).unwrap();
        assert_eq!(result, vec!["hello"]);

        // Test with small chunk size and large stride

        let params = ChunkParams::CharacterSplit(CharacterSplitParams {
            chunk_size: 1,
            stride: 1_000_000,
        });
        let text = "hello";
        let result = splitter.chunk(text, &params).unwrap();
        assert_eq!(result, vec!["h"]);
    }
}
