# syntax=docker/dockerfile:1.7
#
# pii-redactor — gRPC service that redacts PII from a list of texts on CPU.
#
# The default build bakes in OpenAI's privacy-filter FP32 ONNX export
# (~5.4 GB across three external-data shards) pulled from HuggingFace at
# build time, so the resulting image is fully self-contained at runtime —
# no `./models/` prep needed. FP32 is intentional on CPU: MLAS has a
# tuned FP32 GEMM and no kernel coverage for the int8 graph's
# GatherBlockQuantized layout, so the int8 variant runs slower (per-op
# de-quant fallback) and floods logs with "unpacked compute mode".
#
# To use a different model:
#   - Override the HF_* build args at `docker build` time (see `weights`
#     stage below), or
#   - Bind-mount your own model directory at runtime:
#       docker run -v "$(pwd)/models:/models:ro" lmnr/pii-redactor:latest

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


# Weight-fetcher: downloads the model graph + tokenizer + config from
# HuggingFace, pinned to a specific commit so rebuilds are reproducible.
# Output layout matches what engine.rs expects under /models:
#   model.onnx, <basename>.onnx_data (if applicable), tokenizer.json, config.json
FROM debian:trixie-slim AS weights

ARG HF_MODEL=openai/privacy-filter
# Latest commit on `main` as of writing. Bump by checking
# https://huggingface.co/api/models/openai/privacy-filter (sha field).
ARG HF_REVISION=7ffa9a043d54d1be65afb281eddf0ffbe629385b
# Repo-relative paths. Defaults pick the FP32 graph (3 external-data
# shards, ~5.4 GB total). MLAS — ORT's CPU MatMul backend — has a
# tuned FP32 GEMM and zero kernel coverage for the GatherBlockQuantized
# layout used by `model_quantized.onnx`, so on CPU the FP32 graph is
# faster end-to-end (no per-MatMul de-quantize → fp32 fallback) and
# stops emitting hundreds of "unpacked compute mode" / BFCArena lines
# per inference. The image is ~3 GB larger but throughput is what we
# care about.
# To swap variants, override at build time, e.g. revert to int8:
#   --build-arg HF_MODEL_FILE=onnx/model_quantized.onnx \
#   --build-arg HF_MODEL_DATA_FILES=onnx/model_quantized.onnx_data
ARG HF_MODEL_FILE=onnx/model.onnx
ARG HF_MODEL_DATA_FILES="onnx/model.onnx_data onnx/model.onnx_data_1 onnx/model.onnx_data_2"
ARG HF_TOKENIZER_FILE=tokenizer.json
ARG HF_CONFIG_FILE=config.json

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /models

# One RUN to keep this as a single layer (~5.4 GB for FP32); --fail turns
# 4xx/5xx into build failures rather than truncated downloads, --retry
# covers HF CDN blips.
RUN set -eux; \
    HF_BASE="https://huggingface.co/${HF_MODEL}/resolve/${HF_REVISION}"; \
    curl -L --fail --retry 5 --retry-delay 2 -o tokenizer.json "${HF_BASE}/${HF_TOKENIZER_FILE}"; \
    curl -L --fail --retry 5 --retry-delay 2 -o config.json    "${HF_BASE}/${HF_CONFIG_FILE}"; \
    curl -L --fail --retry 5 --retry-delay 2 -o model.onnx     "${HF_BASE}/${HF_MODEL_FILE}"; \
    for data_path in ${HF_MODEL_DATA_FILES}; do \
      # Keep the original basename — the .onnx graph's external_data ref
      # points to it; renaming would orphan the tensors.
      data_basename=$(basename "${data_path}"); \
      curl -L --fail --retry 5 --retry-delay 2 -o "${data_basename}" "${HF_BASE}/${data_path}"; \
    done; \
    # Defensive alias in case the graph references `model.onnx_data` directly.
    first_data=$(set -- ${HF_MODEL_DATA_FILES}; echo "${1:-}"); \
    if [ -n "${first_data}" ]; then \
      first_basename=$(basename "${first_data}"); \
      [ -e model.onnx_data ] || ln -s "${first_basename}" model.onnx_data; \
    fi; \
    ls -la /models


FROM debian:trixie-slim

# ONNX Runtime CPU shared library — pinned to match `ort` 2.0.0-rc.10.
# TARGETARCH is populated by BuildKit (`amd64` / `arm64`). Per-arch SHA-256
# verifies the GitHub release asset hasn't been tampered with. The dynamic
# loader reports a missing-file error rather than an arch-mismatch error
# when ELF classes disagree, so getting this right per platform matters.
ARG TARGETARCH
# `ort` 2.0.0-rc.12 with the `api-24` feature requires ONNX Runtime 1.24.x.
# 1.24.4 is the latest patch in the 1.24 line.
ARG ORT_VERSION=1.24.4
ARG ORT_SHA256_AMD64=3a211fbea252c1e66290658f1b735b772056149f28321e71c308942cdb54b747
ARG ORT_SHA256_ARM64=866109a9248d057671a039b9d725be4bd86888e3754140e6701ec621be9d4d7e
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) ORT_ARCH=x64;     ORT_SHA="${ORT_SHA256_AMD64}" ;; \
      arm64) ORT_ARCH=aarch64; ORT_SHA="${ORT_SHA256_ARM64}" ;; \
      *)     echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    rm -rf /var/lib/apt/lists/*; \
    curl -L -o /tmp/ort.tgz \
      "https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-linux-${ORT_ARCH}-${ORT_VERSION}.tgz"; \
    echo "${ORT_SHA}  /tmp/ort.tgz" | sha256sum -c -; \
    tar -xzf /tmp/ort.tgz -C /tmp; \
    # -d preserves the symlink chain (.so -> .so.1 -> .so.1.20.0) so ldconfig
    # doesn't warn and the on-disk layout matches standard Linux conventions.
    cp -d /tmp/onnxruntime-linux-${ORT_ARCH}-${ORT_VERSION}/lib/libonnxruntime.so* /usr/local/lib/; \
    ldconfig; \
    rm -rf /tmp/ort.tgz /tmp/onnxruntime-linux-${ORT_ARCH}-${ORT_VERSION}

RUN groupadd --system --gid 999 nonroot \
 && useradd --system --gid 999 --uid 999 --create-home nonroot

COPY --from=builder /build/target/release/pii-redactor /usr/local/bin/pii-redactor
COPY --from=weights --chown=nonroot:nonroot /models /models

ENV ORT_DYLIB_PATH=/usr/local/lib/libonnxruntime.so
ENV PII_MODEL_DIR=/models
ENV PII_PORT=8910
ENV RUST_LOG=info

USER nonroot
EXPOSE 8910
ENTRYPOINT ["/usr/local/bin/pii-redactor"]
