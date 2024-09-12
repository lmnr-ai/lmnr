pub mod opentelemetry {
    pub mod proto {
        pub mod collector {
            pub mod trace {
                pub mod v1 {
                    include!("opentelemetry.proto.collector.trace.v1.rs");
                }
            }
        }
    }
}
pub mod opentelemetry_proto_common_v1 {
    include!("opentelemetry_proto_common_v1.rs");
}
pub mod opentelemetry_proto_resource_v1 {
    include!("opentelemetry_proto_resource_v1.rs");
}
pub mod opentelemetry_proto_trace_v1 {
    include!("opentelemetry_proto_trace_v1.rs");
}
