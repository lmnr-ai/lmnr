# syntax=docker/dockerfile:1.7
#
# pii-redactor — gRPC service that redacts PII from a list of texts on CPU.
#
# Weight baking:
#   Place model.onnx, tokenizer.json, and config.json into ./models/ before
#   building. The image copies them into /models so the container is fully
#   self-contained at runtime.

FROM rust:1.90-trixie AS builder

RUN apt-get update \
 && apt-get install -y --no-install-recommends protobuf-compiler cmake clang \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Cache deps separately from source.
COPY Cargo.toml Cargo.lock* ./
COPY build.rs ./
COPY proto ./proto
RUN mkdir -p src && echo "fn main() {}" > src/main.rs \
 && cargo build --release \
 && rm -rf src

COPY src ./src
RUN cargo build --release \
 && strip target/release/pii-redactor


FROM debian:trixie-slim

# ONNX Runtime CPU shared library — pinned to match `ort` 2.0.0-rc.10.
# SHA-256 verifies the GitHub release asset hasn't been tampered with.
ARG ORT_VERSION=1.20.0
ARG ORT_SHA256=aa70d48b22e264b82e83f63245b51ddc9a47ae4a3a66903efaff1ba68b7b5930
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && curl -L -o /tmp/ort.tgz \
      "https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-linux-x64-${ORT_VERSION}.tgz" \
 && echo "${ORT_SHA256}  /tmp/ort.tgz" | sha256sum -c - \
 && tar -xzf /tmp/ort.tgz -C /tmp \
 && cp /tmp/onnxruntime-linux-x64-${ORT_VERSION}/lib/libonnxruntime.so* /usr/local/lib/ \
 && ldconfig \
 && rm -rf /tmp/ort.tgz /tmp/onnxruntime-linux-x64-${ORT_VERSION}

RUN groupadd --system --gid 999 nonroot \
 && useradd --system --gid 999 --uid 999 --create-home nonroot

COPY --from=builder /build/target/release/pii-redactor /usr/local/bin/pii-redactor
COPY --chown=nonroot:nonroot models /models

ENV ORT_DYLIB_PATH=/usr/local/lib/libonnxruntime.so
ENV PII_MODEL_DIR=/models
ENV PII_PORT=8910
ENV RUST_LOG=info

USER nonroot
EXPOSE 8910
ENTRYPOINT ["/usr/local/bin/pii-redactor"]
