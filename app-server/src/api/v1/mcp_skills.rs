//! Agent Skills served over MCP through the `io.modelcontextprotocol/skills` extension (SEP-2640):
//! https://modelcontextprotocol.io/extensions/skills/overview
//!
//! Skills are vendored under `app-server/skills/` (synced from the public lmnr-ai/lmnr-skills repo)
//! and embedded at build time, so manifests and digests are fixed per binary and identical across
//! replicas. Skills are public content: no project data is read and every result is `public`.

use std::{collections::BTreeMap, sync::LazyLock};

use rmcp::{
    ErrorData as McpError,
    model::{CacheScope, CustomResult, ReadResourceResult, Resource, ResourceContents},
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

include!(concat!(env!("OUT_DIR"), "/skills.rs"));

pub const SKILLS_EXTENSION_ID: &str = "io.modelcontextprotocol/skills";
pub const SKILLS_LIST_METHOD: &str = "skills/list";
pub const SKILLS_GET_METHOD: &str = "skills/get";

const SKILL_URI_SCHEME: &str = "skill://";
const SKILL_FILE_NAME: &str = "SKILL.md";
/// Content only changes with a deploy, so let clients cache for a while.
pub const SKILLS_TTL_MS: u64 = 3_600_000;

struct SkillFile {
    uri: String,
    /// Path relative to the skill root, e.g. `references/cli.md`.
    path: String,
    mime_type: &'static str,
    content: &'static str,
}

struct Skill {
    name: String,
    description: String,
    /// URI of the skill's `SKILL.md`.
    uri: String,
    /// The full `SKILL.md` frontmatter, unchanged (the spec requires every field to be preserved).
    frontmatter: Map<String, Value>,
    /// `SKILL.md` first, then supporting files sorted by path.
    files: Vec<SkillFile>,
}

#[derive(Serialize)]
struct ManifestEntry<'a> {
    uri: &'a str,
    digest: String,
    size: usize,
}

#[derive(Serialize)]
struct SkillEntry<'a> {
    uri: &'a str,
    frontmatter: &'a Map<String, Value>,
    resources: Vec<ManifestEntry<'a>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillsListResult<'a> {
    result_type: &'static str,
    skills: Vec<SkillEntry<'a>>,
    ttl_ms: u64,
    cache_scope: CacheScope,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillsGetResult<'a> {
    result_type: &'static str,
    skill: SkillEntry<'a>,
    ttl_ms: u64,
    cache_scope: CacheScope,
}

#[derive(Deserialize)]
struct SkillsGetParams {
    uri: String,
}

pub struct SkillRegistry {
    skills: Vec<Skill>,
}

static REGISTRY: LazyLock<SkillRegistry> =
    LazyLock::new(|| SkillRegistry::from_files(EMBEDDED_SKILL_FILES));

/// The skills embedded in this binary.
pub fn registry() -> &'static SkillRegistry {
    &REGISTRY
}

impl SkillRegistry {
    /// Build from `(path relative to skills/, contents)` pairs. A skill whose `SKILL.md` is missing
    /// or invalid is logged and skipped rather than served half-broken.
    fn from_files(files: &[(&'static str, &'static str)]) -> Self {
        let mut by_skill: BTreeMap<&str, Vec<(&str, &'static str)>> = BTreeMap::new();
        for (path, content) in files {
            if let Some((skill_dir, file_path)) = path.split_once('/') {
                by_skill
                    .entry(skill_dir)
                    .or_default()
                    .push((file_path, content));
            }
        }

        let skills = by_skill
            .into_iter()
            .filter_map(|(dir, files)| match build_skill(dir, files) {
                Ok(skill) => Some(skill),
                Err(e) => {
                    log::error!("Skipping invalid MCP skill '{dir}': {e}");
                    None
                }
            })
            .collect();
        Self { skills }
    }

    pub fn is_empty(&self) -> bool {
        self.skills.is_empty()
    }

    /// Fallback for clients without the skills extension: point them at `resources/read`.
    pub fn server_instructions(&self) -> Option<String> {
        if self.skills.is_empty() {
            return None;
        }
        let list = self
            .skills
            .iter()
            .map(|skill| format!("- {} ({}): {}", skill.name, skill.uri, skill.description))
            .collect::<Vec<_>>()
            .join("\n");
        Some(format!(
            "This server publishes Agent Skills through the {SKILLS_EXTENSION_ID} extension \
             ({SKILLS_LIST_METHOD} / {SKILLS_GET_METHOD}). If your client does not support it, read a \
             skill's SKILL.md with resources/read and resolve its relative references (e.g. \
             references/cli.md) against the skill root.\n\nSkills:\n{list}"
        ))
    }

    pub fn list(&self) -> CustomResult {
        to_custom_result(&SkillsListResult {
            result_type: "complete",
            skills: self.skills.iter().map(Skill::entry).collect(),
            ttl_ms: SKILLS_TTL_MS,
            cache_scope: CacheScope::Public,
        })
    }

    pub fn get(&self, params: Option<Value>) -> Result<CustomResult, McpError> {
        let params: SkillsGetParams = params
            .and_then(|params| serde_json::from_value(params).ok())
            .ok_or_else(|| McpError::invalid_params("skills/get requires a `uri` string", None))?;
        let skill = self
            .skills
            .iter()
            .find(|skill| skill.uri == params.uri)
            .ok_or_else(|| {
                McpError::invalid_params(format!("Unknown skill: {}", params.uri), None)
            })?;
        Ok(to_custom_result(&SkillsGetResult {
            result_type: "complete",
            skill: skill.entry(),
            ttl_ms: SKILLS_TTL_MS,
            cache_scope: CacheScope::Public,
        }))
    }

    /// Every skill file, so resource-only clients can find them in `resources/list`.
    pub fn resources(&self) -> Vec<Resource> {
        self.skills
            .iter()
            .flat_map(|skill| {
                skill.files.iter().map(move |file| {
                    let resource =
                        Resource::new(&file.uri, format!("{}/{}", skill.name, file.path))
                            .with_mime_type(file.mime_type)
                            .with_size(file.content.len() as u64);
                    if file.path == SKILL_FILE_NAME {
                        resource.with_description(&skill.description)
                    } else {
                        resource
                    }
                })
            })
            .collect()
    }

    /// Serve one skill file. `None` when the URI is not a file of any embedded skill.
    pub fn read(&self, uri: &str) -> Option<ReadResourceResult> {
        let file = self
            .skills
            .iter()
            .flat_map(|skill| skill.files.iter())
            .find(|file| file.uri == uri)?;
        Some(
            ReadResourceResult::new(vec![ResourceContents::TextResourceContents {
                uri: file.uri.clone(),
                mime_type: Some(file.mime_type.to_string()),
                text: file.content.to_string(),
                meta: None,
            }])
            .with_ttl_ms(SKILLS_TTL_MS)
            .with_cache_scope(CacheScope::Public),
        )
    }
}

impl Skill {
    fn entry(&self) -> SkillEntry<'_> {
        SkillEntry {
            uri: &self.uri,
            frontmatter: &self.frontmatter,
            resources: self
                .files
                .iter()
                .map(|file| ManifestEntry {
                    uri: &file.uri,
                    digest: sha256_digest(file.content),
                    size: file.content.len(),
                })
                .collect(),
        }
    }
}

fn build_skill(dir: &str, files: Vec<(&str, &'static str)>) -> anyhow::Result<Skill> {
    let skill_md = files
        .iter()
        .find(|(path, _)| *path == SKILL_FILE_NAME)
        .map(|(_, content)| *content)
        .ok_or_else(|| anyhow::anyhow!("missing {SKILL_FILE_NAME}"))?;
    let frontmatter = parse_frontmatter(skill_md)?;

    // The spec requires `name` to match the skill directory, which is also the URI authority.
    let name = frontmatter
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("frontmatter has no `name`"))?;
    if name != dir {
        anyhow::bail!("frontmatter name '{name}' does not match directory '{dir}'");
    }
    let description = frontmatter
        .get("description")
        .and_then(Value::as_str)
        .filter(|description| !description.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("frontmatter has no `description`"))?
        .to_string();

    let mut files: Vec<SkillFile> = files
        .into_iter()
        .map(|(path, content)| SkillFile {
            uri: format!("{SKILL_URI_SCHEME}{dir}/{path}"),
            path: path.to_string(),
            mime_type: mime_type_for(path),
            content,
        })
        .collect();
    files.sort_by(|a, b| {
        (a.path != SKILL_FILE_NAME, &a.path).cmp(&(b.path != SKILL_FILE_NAME, &b.path))
    });

    Ok(Skill {
        name: dir.to_string(),
        description,
        uri: format!("{SKILL_URI_SCHEME}{dir}/{SKILL_FILE_NAME}"),
        frontmatter,
        files,
    })
}

/// Parse the YAML frontmatter block (between the leading `---` and the next `---` line).
fn parse_frontmatter(content: &str) -> anyhow::Result<Map<String, Value>> {
    let mut lines = content.split_inclusive('\n');
    if lines.next().map(str::trim_end) != Some("---") {
        anyhow::bail!("SKILL.md must start with a `---` frontmatter block");
    }
    let yaml: String = lines
        .by_ref()
        .take_while(|line| line.trim_end() != "---")
        .collect();
    match serde_norway::from_str::<Value>(&yaml)? {
        Value::Object(frontmatter) => Ok(frontmatter),
        _ => anyhow::bail!("frontmatter is not a YAML mapping"),
    }
}

fn mime_type_for(path: &str) -> &'static str {
    match path.rsplit_once('.').map(|(_, ext)| ext) {
        Some("md") => "text/markdown",
        Some("json") => "application/json",
        Some("py") => "text/x-python",
        Some("ts") => "text/x-typescript",
        Some("sh") => "text/x-shellscript",
        _ => "text/plain",
    }
}

fn sha256_digest(content: &str) -> String {
    format!("sha256:{}", hex::encode(Sha256::digest(content.as_bytes())))
}

fn to_custom_result(result: &impl Serialize) -> CustomResult {
    CustomResult::new(serde_json::to_value(result).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SKILL_MD: &str = "---\nname: code-review\ndescription: Review code using the team's checklist.\n---\n\n# Code review\n\nRead `references/checklist.md`, then review the diff.\n";
    const CHECKLIST: &str = "# Review checklist\n\nCheck correctness, tests, and compatibility.\n";

    fn spec_example() -> SkillRegistry {
        SkillRegistry::from_files(&[
            ("code-review/references/checklist.md", CHECKLIST),
            ("code-review/SKILL.md", SKILL_MD),
        ])
    }

    /// Digests and sizes match the worked example in the extension spec byte-for-byte.
    #[test]
    fn list_matches_spec_example() {
        let list = spec_example().list().0;
        assert_eq!(
            list,
            serde_json::json!({
                "resultType": "complete",
                "skills": [{
                    "uri": "skill://code-review/SKILL.md",
                    "frontmatter": {
                        "name": "code-review",
                        "description": "Review code using the team's checklist."
                    },
                    "resources": [
                        {
                            "uri": "skill://code-review/SKILL.md",
                            "digest": "sha256:d2489d6c182e8df9c178563ff9f2eac7998a0c1bb1278c52a7fd5306e4259160",
                            "size": 149
                        },
                        {
                            "uri": "skill://code-review/references/checklist.md",
                            "digest": "sha256:dbab2de7bf7db9cc95cb6ce681c3690b26184db39f75b958a0287ca6d9e24e20",
                            "size": 65
                        }
                    ]
                }],
                "ttlMs": SKILLS_TTL_MS,
                "cacheScope": "public"
            })
        );
    }

    #[test]
    fn get_returns_entry_or_invalid_params() {
        let registry = spec_example();
        let found = registry
            .get(Some(
                serde_json::json!({ "uri": "skill://code-review/SKILL.md" }),
            ))
            .expect("known skill")
            .0;
        assert_eq!(found["skill"]["uri"], "skill://code-review/SKILL.md");
        assert_eq!(found["resultType"], "complete");

        for params in [
            Some(serde_json::json!({ "uri": "skill://nope/SKILL.md" })),
            // A supporting file is not a skill.
            Some(serde_json::json!({ "uri": "skill://code-review/references/checklist.md" })),
            None,
        ] {
            let err = registry.get(params).expect_err("must be rejected");
            assert_eq!(err.code, rmcp::model::ErrorCode::INVALID_PARAMS);
        }
    }

    #[test]
    fn read_serves_exact_bytes() {
        let registry = spec_example();
        let result = registry
            .read("skill://code-review/references/checklist.md")
            .expect("known file");
        match &result.contents[..] {
            [
                ResourceContents::TextResourceContents {
                    text, mime_type, ..
                },
            ] => {
                assert_eq!(text, CHECKLIST);
                assert_eq!(mime_type.as_deref(), Some("text/markdown"));
            }
            other => panic!("unexpected contents: {other:?}"),
        }
        assert!(registry.read("skill://code-review/missing.md").is_none());
        assert!(registry.read("file:///etc/passwd").is_none());
    }

    #[test]
    fn frontmatter_is_preserved_unchanged() {
        let registry = SkillRegistry::from_files(&[(
            "x/SKILL.md",
            "---\nname: x\ndescription: \"quoted: with colon\"\nmetadata:\n  version: 2\nallowed-tools: [a, b]\n---\nbody\n",
        )]);
        let list = registry.list().0;
        assert_eq!(
            list["skills"][0]["frontmatter"],
            serde_json::json!({
                "name": "x",
                "description": "quoted: with colon",
                "metadata": { "version": 2 },
                "allowed-tools": ["a", "b"]
            })
        );
    }

    #[test]
    fn invalid_skills_are_skipped() {
        let registry = SkillRegistry::from_files(&[
            ("no-skill-md/references/a.md", "a"),
            (
                "wrong-name/SKILL.md",
                "---\nname: other\ndescription: d\n---\n",
            ),
            ("no-frontmatter/SKILL.md", "# hi\n"),
            (
                "no-description/SKILL.md",
                "---\nname: no-description\n---\n",
            ),
        ]);
        assert!(registry.is_empty());
        assert!(registry.server_instructions().is_none());
    }

    /// The vendored skills all parse: a broken sync would otherwise only show up as an error log.
    #[test]
    fn embedded_skills_are_valid() {
        let skill_dirs: std::collections::BTreeSet<&str> = EMBEDDED_SKILL_FILES
            .iter()
            .filter_map(|(path, _)| path.split_once('/').map(|(dir, _)| dir))
            .collect();
        assert!(skill_dirs.contains("laminar"), "laminar skill not embedded");
        assert_eq!(registry().skills.len(), skill_dirs.len());

        let laminar = registry()
            .skills
            .iter()
            .find(|skill| skill.name == "laminar")
            .expect("laminar skill");
        // Every relative `references/*.md` link in SKILL.md resolves to a served file.
        let skill_md = laminar.files[0].content;
        for (idx, _) in skill_md.match_indices("references/") {
            let link: String = skill_md[idx..]
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '-' | '_' | '.'))
                .collect();
            let link = link.trim_end_matches('.');
            assert!(
                laminar.files.iter().any(|file| file.path == link),
                "SKILL.md links to {link}, which is not in the skill"
            );
        }
    }
}
