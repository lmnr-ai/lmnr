fn main() -> Result<(), Box<dyn std::error::Error>> {
   let proto_file = "./proto/semantic_search_grpc.proto";

   tonic_build::configure()
           .protoc_arg("--experimental_allow_proto3_optional") // for older systems
           .build_server(true)
           .out_dir("./src/semantic_search/")
           .compile(&[proto_file], &["proto"])?;

   Ok(())
}