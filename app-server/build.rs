fn main() -> Result<(), Box<dyn std::error::Error>> {
    let query_engine_proto_file = "./proto/query_engine.proto";

    tonic_prost_build::configure()
        .protoc_arg("--experimental_allow_proto3_optional") // for older systems
        .build_client(true)
        .build_server(false)
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        .type_attribute("Metric", "#[serde(rename_all = \"camelCase\")]")
        .type_attribute("Filter", "#[serde(rename_all = \"camelCase\")]")
        .field_attribute("Filter.value", "#[serde(flatten)]")
        .type_attribute("Filter.value", "#[serde(rename_all = \"camelCase\")]")
        .type_attribute("TimeRange", "#[serde(rename_all = \"camelCase\")]")
        .type_attribute("OrderBy", "#[serde(rename_all = \"camelCase\")]")
        .type_attribute("QueryStructure", "#[serde(rename_all = \"camelCase\")]")
        .type_attribute("QueryRequest", "#[serde(rename_all = \"camelCase\")]")
        .type_attribute("QueryResponse", "#[serde(rename_all = \"camelCase\")]")
        .type_attribute("SuccessResponse", "#[serde(rename_all = \"camelCase\")]")
        .type_attribute("ErrorResponse", "#[serde(rename_all = \"camelCase\")]")
        .type_attribute("JsonToSqlRequest", "#[serde(rename_all = \"camelCase\")]")
        .type_attribute(
            "JsonToSqlSuccessResponse",
            "#[serde(rename_all = \"camelCase\")]",
        )
        .type_attribute("JsonToSqlResponse", "#[serde(rename_all = \"camelCase\")]")
        .type_attribute("SqlToJsonRequest", "#[serde(rename_all = \"camelCase\")]")
        .type_attribute(
            "SqlToJsonSuccessResponse",
            "#[serde(rename_all = \"camelCase\")]",
        )
        .type_attribute("SqlToJsonResponse", "#[serde(rename_all = \"camelCase\")]")
        .out_dir("./src/query_engine/")
        .compile_protos(&[query_engine_proto_file], &["proto"])?;

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
