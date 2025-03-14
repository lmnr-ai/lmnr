fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto_file = "./proto/semantic_search_grpc.proto";

    tonic_build::configure()
        .protoc_arg("--experimental_allow_proto3_optional") // for older systems
        .build_client(true)
        .build_server(false)
        .out_dir("./src/semantic_search/")
        .compile_protos(&[proto_file], &["proto"])?;

    let proto_file = "./proto/code_executor_grpc.proto";

    tonic_build::configure()
        .protoc_arg("--experimental_allow_proto3_optional") // for older systems
        .build_client(true)
        .build_server(false)
        .out_dir("./src/code_executor/")
        .compile_protos(&[proto_file], &["proto"])?;

    let proto_file = "./proto/machine_manager_grpc.proto";

    tonic_build::configure()
        .protoc_arg("--experimental_allow_proto3_optional") // for older systems
        .build_client(true)
        .build_server(false)
        .out_dir("./src/machine_manager/")
        .compile_protos(&[proto_file], &["proto"])?;

    let proto_file = "./proto/agent_manager_grpc.proto";

    tonic_build::configure()
        .protoc_arg("--experimental_allow_proto3_optional") // for older systems
        .build_client(true)
        .build_server(false)
        .out_dir("./src/agent_manager/")
        .compile_protos(&[proto_file], &["proto"])?;

    tonic_build::configure()
        .protoc_arg("--experimental_allow_proto3_optional") // for older systems
        .build_client(false)
        .build_server(true)
        .include_file("mod.rs")
        .out_dir("./src/opentelemetry/")
        .compile_protos(
            &[
                "./proto/opentelemetry/common.proto",
                "./proto/opentelemetry/resource.proto",
                "./proto/opentelemetry/trace.proto",
                "./proto/opentelemetry/trace_service.proto",
            ],
            &["proto"],
        )?;

    Ok(())
}
