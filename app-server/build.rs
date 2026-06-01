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

    Ok(())
}
