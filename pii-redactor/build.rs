fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_prost_build::configure()
        .build_client(false)
        .build_server(true)
        .compile_protos(&["./proto/pii_redactor.proto"], &["proto"])?;
    Ok(())
}
