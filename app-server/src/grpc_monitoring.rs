use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

use http::{Request, Response};
use tower::{Layer, Service};

/// Tower layer that monitors gRPC responses and logs error status codes.
///
/// When paired with Sentry's tracing integration, error-level logs are
/// automatically captured as Sentry events.
#[derive(Clone, Debug)]
pub struct GrpcMonitoringLayer;

impl<S> Layer<S> for GrpcMonitoringLayer {
    type Service = GrpcMonitoringService<S>;

    fn layer(&self, service: S) -> Self::Service {
        GrpcMonitoringService { inner: service }
    }
}

#[derive(Clone, Debug)]
pub struct GrpcMonitoringService<S> {
    inner: S,
}

impl<S, ReqBody, ResBody> Service<Request<ReqBody>> for GrpcMonitoringService<S>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send + 'static,
    S::Future: Send + 'static,
    S::Error: std::fmt::Debug + Send + 'static,
    ReqBody: Send + 'static,
    ResBody: Send + 'static,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, request: Request<ReqBody>) -> Self::Future {
        let path = request.uri().path().to_string();
        // https://docs.rs/tower/latest/tower/trait.Service.html#be-careful-when-cloning-inner-services
        let clone = self.inner.clone();
        let mut inner = std::mem::replace(&mut self.inner, clone);

        Box::pin(async move {
            let response = inner.call(request).await;

            if let Ok(resp) = &response {
                if let Some(grpc_status) = resp.headers().get("grpc-status") {
                    if let Ok(code) = grpc_status.to_str().unwrap_or_default().parse::<i32>() {
                        let grpc_message = resp
                            .headers()
                            .get("grpc-message")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("unknown");
                        println!(
                            "gRPC {code_name} on {path}: {message}",
                            code_name = grpc_code_name(code),
                            path = path,
                            message = grpc_message
                        );
                        log_grpc_status(&path, code, grpc_message);
                    }
                }
            }

            response
        })
    }
}

// gRPC status codes we want to capture as errors in Sentry
const GRPC_CODE_OK: i32 = 0;
const GRPC_CODE_DEADLINE_EXCEEDED: i32 = 4;
const GRPC_CODE_OUT_OF_RANGE: i32 = 11;
const GRPC_CODE_INTERNAL: i32 = 13;
const GRPC_CODE_UNAVAILABLE: i32 = 14;
const GRPC_CODE_DATA_LOSS: i32 = 15;

fn grpc_code_name(code: i32) -> &'static str {
    match code {
        0 => "OK",
        1 => "CANCELLED",
        2 => "UNKNOWN",
        3 => "INVALID_ARGUMENT",
        4 => "DEADLINE_EXCEEDED",
        5 => "NOT_FOUND",
        6 => "ALREADY_EXISTS",
        7 => "PERMISSION_DENIED",
        8 => "RESOURCE_EXHAUSTED",
        9 => "FAILED_PRECONDITION",
        10 => "ABORTED",
        11 => "OUT_OF_RANGE",
        12 => "UNIMPLEMENTED",
        13 => "INTERNAL",
        14 => "UNAVAILABLE",
        15 => "DATA_LOSS",
        16 => "UNAUTHENTICATED",
        _ => "UNKNOWN",
    }
}

fn log_grpc_status(path: &str, code: i32, message: &str) {
    if code == GRPC_CODE_OK {
        return;
    }

    let code_name = grpc_code_name(code);

    match code {
        GRPC_CODE_DEADLINE_EXCEEDED
        | GRPC_CODE_OUT_OF_RANGE
        | GRPC_CODE_INTERNAL
        | GRPC_CODE_UNAVAILABLE
        | GRPC_CODE_DATA_LOSS => {
            log::error!("gRPC {code_name} on {path}: {message}",);
        }
        _ => {
            log::warn!("gRPC {code_name} on {path}: {message}",);
        }
    }
}
