use rand::SeedableRng;
use rand::{rngs::StdRng, Rng};
use std::{
    fs::File,
    io::{self, BufRead},
    path::Path,
};
use tokio::sync::RwLock;

fn read_lines<P>(filename: P) -> io::Result<Vec<String>>
where
    P: AsRef<Path>,
{
    let file = File::open(filename)?;
    let buf_reader = io::BufReader::new(file);
    let lines = buf_reader.lines().collect::<Result<Vec<_>, _>>();
    lines
}

pub struct NameGenerator {
    adjectives: Vec<String>,
    nouns: Vec<String>,
    rng: RwLock<StdRng>,
}

impl NameGenerator {
    pub fn new() -> Self {
        let adjectives = read_lines("data/adjectives.txt").unwrap();
        let nouns = read_lines("data/nouns.txt").unwrap();
        let rng = RwLock::new(StdRng::from_entropy());
        Self {
            adjectives,
            nouns,
            rng,
        }
    }

    pub async fn next(&self) -> String {
        let adj_index = self.rng.write().await.gen_range(0..self.adjectives.len());
        let noun_index = self.rng.write().await.gen_range(0..self.nouns.len());
        format!("{}-{}", self.adjectives[adj_index], self.nouns[noun_index])
    }
}
