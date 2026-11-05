fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_prost_build::configure()
        .protoc_arg("--experimental_allow_proto3_optional") // for older systems
        .build_client(false)
        .build_server(true)
        .include_file("mod.rs")
        .type_attribute("TracesData", "#[allow(dead_code)]")
        .type_attribute("LogsData", "#[allow(dead_code)]")
        .out_dir("./src/opentelemetry_proto/")
        .compile_protos(
            &[
                "./proto/opentelemetry/common.proto",
                "./proto/opentelemetry/resource.proto",
                "./proto/opentelemetry/trace.proto",
                "./proto/opentelemetry/trace_service.proto",
                "./proto/opentelemetry/logs.proto",
            ],
            &["proto"],
        )?;

    tonic_prost_build::configure()
        .protoc_arg("--experimental_allow_proto3_optional")
        .build_client(true)
        .build_server(false)
        .out_dir("./src/pii_redactor/")
        .compile_protos(&["./proto/pii_redactor.proto"], &["proto"])?;

    tonic_prost_build::configure()
        .protoc_arg("--experimental_allow_proto3_optional")
        .build_client(true)
        .build_server(false)
        .include_file("mod.rs")
        .type_attribute("QueueExistsRequest", "#[allow(dead_code)]")
        .type_attribute("CreateQueueRequest", "#[allow(dead_code)]")
        .type_attribute("CreateQueueIfNotExistsRequest", "#[allow(dead_code)]")
        .type_attribute("CreateQueueIfNotExistsResponse", "#[allow(dead_code)]")
        .type_attribute("DropQueueRequest", "#[allow(dead_code)]")
        .type_attribute("ListQueuesRequest", "#[allow(dead_code)]")
        .type_attribute("ListQueuesResponse", "#[allow(dead_code)]")
        .type_attribute("SuggestTruncateRequest", "#[allow(dead_code)]")
        .out_dir("./src/quickwit/proto/")
        .compile_protos(&["./proto/quickwit/ingest_service.proto"], &["proto"])?;

    embed_skills()?;

    Ok(())
}

/// Generate `$OUT_DIR/skills.rs`: every file under `skills/` as `(relative path, contents)`, served
/// over MCP by `api::v1::mcp_skills`. Files are `include_str!`ed, so a non-UTF-8 file fails the build.
fn embed_skills() -> Result<(), Box<dyn std::error::Error>> {
    let manifest_dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR")?);
    let skills_dir = manifest_dir.join("skills");
    println!("cargo:rerun-if-changed={}", skills_dir.display());

    let mut files = Vec::new();
    if skills_dir.is_dir() {
        collect_files(&skills_dir, &mut files)?;
    }
    files.sort();

    let mut out = String::from("pub const EMBEDDED_SKILL_FILES: &[(&str, &str)] = &[\n");
    for path in &files {
        let relative = path
            .strip_prefix(&skills_dir)?
            .to_str()
            .ok_or("non-UTF-8 skill file path")?
            .replace(std::path::MAIN_SEPARATOR, "/");
        // Top-level files (e.g. the sync README) are not part of any skill.
        if !relative.contains('/') {
            continue;
        }
        out.push_str(&format!(
            "    ({relative:?}, include_str!({:?})),\n",
            path.display().to_string()
        ));
    }
    out.push_str("];\n");

    std::fs::write(
        std::path::PathBuf::from(std::env::var("OUT_DIR")?).join("skills.rs"),
        out,
    )?;
    Ok(())
}

fn collect_files(
    dir: &std::path::Path,
    files: &mut Vec<std::path::PathBuf>,
) -> Result<(), Box<dyn std::error::Error>> {
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        println!("cargo:rerun-if-changed={}", path.display());
        if path.is_dir() {
            collect_files(&path, files)?;
        } else {
            files.push(path);
        }
    }
    Ok(())
}
