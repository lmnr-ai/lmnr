FROM rust:1.98-slim-trixie AS builder
RUN apt-get update && apt-get install -y --no-install-recommends build-essential protobuf-compiler pkg-config git ca-certificates && rm -rf /var/lib/apt/lists/*
# Trust the sandbox's public egress root only while building; never copy it into the runtime image.
COPY evals/agent-detection/agent/build-ca.crt /usr/local/share/ca-certificates/laminar-build.crt
RUN update-ca-certificates
WORKDIR /src
COPY app-server/Cargo.toml app-server/Cargo.lock ./
COPY app-server/build.rs ./
COPY app-server/proto/ ./proto/
COPY app-server/src/ ./src/
COPY app-server/data/ ./data/
RUN --mount=type=cache,target=/usr/local/cargo/registry,id=lmnr-detection-registry \
    --mount=type=cache,target=/usr/local/cargo/git,id=lmnr-detection-git \
    --mount=type=cache,target=/src/target,id=lmnr-detection-target \
    CARGO_PROFILE_TEST_DEBUG=0 CARGO_BUILD_JOBS=2 CARGO_NET_GIT_FETCH_WITH_CLI=true cargo test harbor_replay_detection_case --no-run && cp $(find target/debug/deps -maxdepth 1 -type f -name 'app_server-*' -executable | head -1) /tmp/detection-replay

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates python3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /tmp/detection-replay /opt/agent/detection-replay
COPY evals/agent-detection/agent/run.py evals/agent-detection/agent/verify.py /opt/agent/
WORKDIR /case
