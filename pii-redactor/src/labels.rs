use std::collections::HashMap;
use std::path::Path;

use anyhow::{Context, Result, anyhow};
use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct LabelMap {
    id_to_label: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ConfigJson {
    #[serde(default)]
    id2label: Option<HashMap<String, String>>,
    #[serde(default)]
    label2id: Option<HashMap<String, u32>>,
}

impl LabelMap {
    pub fn from_config_json(path: &Path) -> Result<Self> {
        let raw =
            std::fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
        let cfg: ConfigJson =
            serde_json::from_str(&raw).with_context(|| format!("parsing {}", path.display()))?;

        let pairs: Vec<(u32, String)> = match (cfg.id2label, cfg.label2id) {
            (Some(m), _) => m
                .into_iter()
                .map(|(k, v)| {
                    let id = k
                        .parse::<u32>()
                        .with_context(|| format!("non-numeric id {k} in id2label"))?;
                    Ok::<_, anyhow::Error>((id, v))
                })
                .collect::<Result<_>>()?,
            (None, Some(m)) => m.into_iter().map(|(k, v)| (v, k)).collect(),
            (None, None) => {
                return Err(anyhow!(
                    "{} has neither id2label nor label2id",
                    path.display()
                ));
            }
        };

        let max_id = pairs.iter().map(|(id, _)| *id).max().unwrap_or(0) as usize;
        let mut id_to_label = vec![String::new(); max_id + 1];
        for (id, label) in pairs {
            id_to_label[id as usize] = label;
        }
        Ok(Self { id_to_label })
    }

    pub fn lookup(&self, id: u32) -> &str {
        // Out-of-bounds and in-bounds-but-unmapped (gap) ids both fall back
        // to "O"; the gap case would otherwise be the empty-string default
        // from vec![String::new(); max_id + 1] and split_bioes would
        // misclassify it as an unprefixed PII label, redacting to
        // "[REDACTED_]".
        match self.id_to_label.get(id as usize).map(String::as_str) {
            Some(s) if !s.is_empty() => s,
            _ => "O",
        }
    }
}
